import { closeTransferredPosition } from './transfer-staging.js';
import { createSourceCompatibleValuation } from './transfer-source-valuation.js';
import { createLivePreviewState } from './transfer-live-preview.js';
import { addMoney } from './money.js';

// Deliberately unavailable on production or the ordinary preview database.
// This storage rehearsal uses a throwaway clone and a caller-owned transaction.
export async function closeRehearsalPosition(client,positionId,quotes,actor,{now=Date.now()}={}) {
  const {rows:[database]}=await client.query('SELECT current_database() AS name');
  if(!/^terminal_migration_test_close_[a-z0-9_]+$/.test(database.name))throw new Error('Close rehearsal requires a separate close-test clone');
  const {rows:[saved]}=await client.query(`SELECT s.* FROM transfer_snapshots s
    JOIN transferred_positions p ON p.snapshot_id=s.id WHERE p.id=$1 FOR UPDATE OF s`,[positionId]);
  if(!saved)throw new Error('Snapshot absent');
  const ticket=(-8000000000000000n-BigInt(positionId)).toString();
  if(!Number.isSafeInteger(Number(ticket)))throw new Error('Virtual ticket outside safe range');
  const {rows:positions}=await client.query('SELECT * FROM transferred_positions WHERE snapshot_id=$1 ORDER BY original_ticket',[saved.id]);
  const selected=positions.find(p=>String(p.id)===String(positionId));
  if(!selected)throw new Error('Position absent');
  if(selected.status==='closed') {
    const {rows:[closure]}=await client.query('SELECT * FROM transferred_position_closures WHERE position_id=$1',[positionId]);
    const {rows:[history]}=await client.query('SELECT * FROM trades WHERE ticket=$1',[ticket]);
    if(!closure||!history)throw new Error('Incomplete rehearsal settlement');
    return {closure,history,account:saved.account_view,repeated:true};
  }
  if(positions.some(p=>p.status!=='open'))throw new Error('This rehearsal starts with a completely open snapshot');
  const value=createSourceCompatibleValuation(saved,positions);
  if(!value)throw new Error('Source-compatible snapshot is required');
  const valuation=value(quotes,{now});
  const read=createLivePreviewState({saved,positions,now:()=>now,quoteCheck:async()=>({status:'ready',valuation,quotes:Object.values(quotes)})});
  const before=(await read()).account;
  const displayed=valuation.positions.find(p=>String(p.id)===String(selected.original_ticket));
  const closure=await closeTransferredPosition(client,positionId,quotes,actor,{now,valuePosition:()=>displayed});
  const p=selected.model.view;
  const {rows:[history]}=await client.query(`INSERT INTO trades
    (ticket,position_id,symbol,type,deal_type,volume,open_price,close_price,stop_loss,take_profit,
     profit,swap,commission,open_time,close_time,is_edited,source,count_in_balance,comment)
    VALUES($1,$2,$3,$4,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,TRUE,'transfer-rehearsal',FALSE,'') RETURNING *`,
    [ticket,selected.original_ticket,p.symbol,p.type,p.volume,p.openPrice,closure.close_price,p.stopLoss,p.takeProfit,
     closure.profit,closure.swap,closure.commission,p.openTime,closure.closed_at]);
  // Same frozen quote: realized P/L moves into balance without an equity jump.
  // Margin remains frozen for this storage rehearsal; no leverage policy implied.
  const account={...before,balance:addMoney(before.balance,closure.total),
    floatingProfit:addMoney(before.floatingProfit,-Number(closure.total))};
  await client.query('UPDATE transfer_snapshots SET account_view=$1 WHERE id=$2',[account,saved.id]);
  return {closure,history,account,before,repeated:false};
}
