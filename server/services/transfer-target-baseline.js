import { readFile } from 'node:fs/promises';

// Caller owns the transaction. This baseline must never follow process restarts.
export async function prepareTargetBaseline(db,{saved,target,now=Date.now()}) {
 const {rows:[context]}=await db.query('SELECT current_database() AS name');
 if(!/^terminal_migration_test_hybrid_[a-z0-9_]+$/.test(context.name))throw new Error('Only isolated hybrid database allowed');
 await db.query(await readFile(new URL('../../database/migrations/018_transfer_target_baseline.sql',import.meta.url),'utf8'));
 await db.query('SELECT id FROM transfer_snapshots WHERE id=$1 FOR UPDATE',[saved.id]);
 const {rows:[existing]}=await db.query('SELECT * FROM transfer_target_baselines WHERE snapshot_id=$1',[saved.id]);
 if(existing){
  if(existing.target_login!==String(saved.target_login)||existing.currency!==saved.account_view.currency)throw new Error('Stored target baseline mismatch');
  return {baseline:existing,created:false};
 }
 if(String(target.account.login)!==String(saved.target_login)||target.account.currency!==saved.account_view.currency)throw new Error('Target account mismatch');
 if(!Array.isArray(target.opened)||!Array.isArray(target.pending)||!Array.isArray(target.deals))throw new Error('Incomplete target inspection');
 if(target.opened.length||target.pending.length||target.deals.some(d=>!['DEAL_TYPE_BALANCE','DEAL_TYPE_CREDIT'].includes(d.type)))throw new Error('Target must have no positions, pending orders or trading history');
 const balance=target.account.balance;
 if(typeof balance!=='number'||!Number.isFinite(balance))throw new Error('Invalid target balance');
 const start=new Date(Math.floor(now/1000)*1000);
 if(!Number.isFinite(start.getTime()))throw new Error('Invalid baseline time');
 const {rows:[baseline]}=await db.query(`INSERT INTO transfer_target_baselines
 (snapshot_id,target_login,started_at,currency,broker_balance_excluded,account_snapshot)
 VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,[saved.id,String(saved.target_login),start,saved.account_view.currency,balance,target.account]);
 return {baseline,created:true};
}
