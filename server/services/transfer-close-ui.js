import { closeRehearsalPosition } from './transfer-close-rehearsal.js';
import { createSourceCompatibleValuation } from './transfer-source-valuation.js';
import { createTransferQuoteCheck } from './transfer-quote-check.js';
import { createLivePreviewState } from './transfer-live-preview.js';

export async function createCloseUi({pool,saved,positions,baseUrl,now=Date.now,fetchImpl=fetch}) {
 const {rows:[db]}=await pool.query('SELECT current_database() AS name');
 if(!/^terminal_migration_test_close_[a-z0-9_]+$/.test(db.name))throw new Error('Close UI requires a dedicated close-test clone');
 const target=positions.find(p=>String(p.original_ticket)===String(saved.payload.sitePositions.positions[0].id));
 if(!target)throw new Error('Target position absent');
 if(positions.some(p=>p.status!=='open'&&p.id!==target.id))throw new Error('Unexpected closed position in rehearsal');
 const originalAccount=saved.payload.siteAccount?.account;
 if(!originalAccount)throw new Error('Original account anchor absent');
 const baseline={...saved,account_view:originalAccount};
 const quoteCheck=createTransferQuoteCheck({baseUrl,saved:baseline,positions,now,fetchImpl});
 const live=createLivePreviewState({saved:baseline,positions,quoteCheck,now});
 const compatible=createSourceCompatibleValuation(baseline,positions);
 const virtualTicket=(-8000000000000000n-BigInt(target.id)).toString();
 async function tx(work){const c=await pool.connect();try{await c.query('BEGIN');const result=await work(c);await c.query('COMMIT');return result;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}}
 async function readState(){
  const {rows:[p]}=await pool.query(`SELECT p.status,s.account_view,c.closed_at,c.quote_snapshot
   FROM transferred_positions p JOIN transfer_snapshots s ON s.id=p.snapshot_id
   LEFT JOIN transferred_position_closures c ON c.position_id=p.id WHERE p.id=$1`,[target.id]);
  if(!p)throw new Error('Rehearsal position disappeared');
  if(p.status==='open'){
   const state=await live();return {...state,source:{...state.source,rehearsalClosed:false,targetTicket:String(target.original_ticket)}};
  }
  if(!p.quote_snapshot||!p.closed_at)throw new Error('Incomplete close rehearsal');
  const valued=compatible(p.quote_snapshot,{now:new Date(p.closed_at).getTime()});
  return {account:p.account_view,positions:valued.positions.filter(v=>String(v.id)!==String(target.original_ticket)),quotes:[],
   source:{mode:'transfer-close-ui',live:false,rehearsalClosed:true,targetTicket:String(target.original_ticket),valuedAt:new Date(p.closed_at).toISOString(),quoteStatus:Object.values(p.quote_snapshot)}};
 }
 async function close(body,actor){
  if(!Number.isSafeInteger(body?.ticket)||String(body.ticket)!==String(target.original_ticket)){
   const e=new Error('В этом тесте можно закрыть только позицию #'+target.original_ticket);e.status=409;throw e;
  }
  if(body.volume!=null){const e=new Error('В этом тесте проверяется полное закрытие');e.status=400;throw e;}
  const {rows:[current]}=await pool.query('SELECT status FROM transferred_positions WHERE id=$1',[target.id]);
  let quotes={};
  if(current.status==='open'){
   const result=await quoteCheck();if(result.status!=='ready'){const e=new Error('Нет доступных котировок');e.status=503;throw e;}
   quotes=Object.fromEntries(result.quotes.map(q=>[q.symbol,q]));
  }
  const result=await tx(c=>closeRehearsalPosition(c,target.id,quotes,actor,{now:now()}));
  return {ticket:Number(target.original_ticket),price:Number(result.closure.close_price),repeated:result.repeated};
 }
 async function restore(){
  return tx(async c=>{
   await c.query('SELECT id FROM transfer_snapshots WHERE id=$1 FOR UPDATE',[saved.id]);
   const {rows:[p]}=await c.query('SELECT status FROM transferred_positions WHERE id=$1',[target.id]);
   if(p.status==='closed'){
    const deleted=await c.query("DELETE FROM trades WHERE ticket=$1 AND source='transfer-rehearsal' AND position_id=$2 RETURNING id",[virtualTicket,target.original_ticket]);
    if(deleted.rowCount!==1)throw new Error('History restore check failed');
    const ledger=await c.query('DELETE FROM transferred_position_closures WHERE position_id=$1 RETURNING position_id',[target.id]);
    if(ledger.rowCount!==1)throw new Error('Settlement restore check failed');
    await c.query("UPDATE transferred_positions SET status='open' WHERE id=$1",[target.id]);
    await c.query('UPDATE transfer_snapshots SET account_view=$1 WHERE id=$2',[originalAccount,saved.id]);
   }
   return {restored:true,ticket:String(target.original_ticket),positions:positions.length,balance:originalAccount.balance};
  });
 }
 let pending=Promise.resolve();
 const serialize=work=>{const result=pending.then(work);pending=result.catch(()=>{});return result;};
 return {targetTicket:String(target.original_ticket),readState,quoteCheck,
   close:(...args)=>serialize(()=>close(...args)),restore:()=>serialize(restore)};
}
