import { normalizePosition, toIso } from './mt5-bridge/normalize.js';
import { createLivePreviewState } from './transfer-live-preview.js';
import { composeTransferHybrid } from './transfer-hybrid-rehearsal.js';
import { roundMoney, addMoney } from './money.js';

function requiredNumber(value,label){
 if(value===null||value===undefined||value===''||!Number.isFinite(Number(value)))throw new Error('Invalid target '+label);
 return Number(value);
}
function normalizeTarget(target){
 if(!Array.isArray(target.opened)||!Array.isArray(target.pending)||!Array.isArray(target.deals))throw new Error('Incomplete target response');
 if(target.pending.length)throw new Error('Pending target orders require a separate display path');
 const positions=target.opened.map(raw=>{
  if(!['POSITION_TYPE_BUY','POSITION_TYPE_SELL',0,1,'buy','sell'].includes(raw.type))throw new Error('Unsupported target position type');
  for(const key of ['ticket','volume','price_open','price_current','profit','swap'])requiredNumber(raw[key],key);
  const p=normalizePosition(raw);
  if(!p.openTime)throw new Error('Invalid target opening time');
  return p;
 });
 const types={DEAL_TYPE_BUY:'buy',DEAL_TYPE_SELL:'sell',DEAL_TYPE_BALANCE:'balance',DEAL_TYPE_CREDIT:'credit'};
 const entries={DEAL_ENTRY_IN:'in',DEAL_ENTRY_OUT:'out',DEAL_ENTRY_INOUT:'inout',DEAL_ENTRY_OUT_BY:'out_by'};
 const deals=target.deals.map(raw=>{
  if(!Object.hasOwn(types,raw.type))throw new Error('Unsupported target deal type: '+raw.type);
  const type=types[raw.type],entry=entries[raw.entry];
  if(['buy','sell'].includes(type)&&!entry)throw new Error('Invalid target deal entry');
  return {ticket:requiredNumber(raw.ticket,'deal ticket'),type,entry:entry||'in',time:toIso(raw.time),
   profit:requiredNumber(raw.profit,'deal profit'),swap:requiredNumber(raw.swap,'deal swap'),commission:requiredNumber(raw.commission,'deal commission')};
 });
 return {positions,deals};
}

// Read-only rehearsal. A complete history is re-read from the persisted baseline,
// so restart/poll retries cannot charge a deal twice. No broker order endpoint.
export function createHybridTransferReader({saved,positions,baseline,quoteCheck,now=Date.now}){
 if(String(baseline.snapshot_id)!==String(saved.id)||String(baseline.target_login)!==String(saved.target_login)||baseline.currency!==saved.account_view.currency)throw new Error('Hybrid baseline mismatch');
 return async()=>{
  const result=await quoteCheck();
  if(result.status!=='ready')throw new Error('Fresh transfer quotes required');
  const oldState=await createLivePreviewState({saved,positions,quoteCheck:async()=>result,now})();
  const target=await quoteCheck.targetState({from:new Date(baseline.started_at).toISOString()});
  const normalized=normalizeTarget(target);
  const combined=composeTransferHybrid({oldState,targetLogin:baseline.target_login,currency:baseline.currency,
   startedAt:new Date(baseline.started_at).toISOString(),account:target.account,...normalized});
  const change=addMoney(combined.accounting.realized,combined.accounting.floating);
  if(combined.accounting.marginLevelNeedsBasis){
   const raw=saved.payload?.brokerAccount;
   const margin=Number(raw?.margin),equity=Number(raw?.equity),level=Number(raw?.margin_level);
   const delta=result.valuation.brokerProfitDelta;
   if(![margin,equity,level,delta].every(Number.isFinite)||margin<=0)throw new Error('Raw account basis required for hybrid margin level');
   combined.account.marginLevel=roundMoney((equity+delta+change)/(margin+combined.accounting.targetMargin)*100+(saved.account_view.marginLevel-level));
   combined.accounting.marginLevelNeedsBasis=false;
  }
  return {...combined,source:{...oldState.source,mode:'transfer-hybrid-rehearsal',startedAt:new Date(baseline.started_at).toISOString(),
   brokerBalanceExcluded:baseline.broker_balance_excluded,targetDeals:normalized.deals.length,targetPositions:normalized.positions.length,
   readOnly:true}};
 };
}
