import { addMoney, roundMoney } from './money.js';

// Pure rehearsal contract: inputs are normalized UTC records, never broker balances.
const TARGET_ID_BASE = 4_000_000_000_000_000;
function finite(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`Invalid ${label}`);
  return value;
}
function ticket(value) {
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n <= 0 || !Number.isSafeInteger(TARGET_ID_BASE + n)) throw new Error('Invalid broker ticket');
  return n;
}
export function targetPositionId(value) { return TARGET_ID_BASE + ticket(value); }

// Rebuild from the complete post-connection deal set on every poll; retries do
// not accumulate deltas. Persist startedAt before enabling a future live feed.
export function composeTransferHybrid({ oldState, targetLogin, currency, startedAt, account, positions, deals }) {
  const start = Date.parse(startedAt);
  if (!Number.isFinite(start) || String(account.login) !== String(targetLogin) || account.currency !== currency || oldState.account.currency !== currency) throw new Error('Hybrid account/baseline mismatch');
  if (!Array.isArray(positions) || !Array.isArray(deals)) throw new Error('Complete target positions and deals required');
  const unique = new Map();
  for (const deal of deals) {
    const id = ticket(deal.ticket);
    const time = Date.parse(deal.time);
    if (!Number.isFinite(time)) throw new Error('Invalid deal time');
    if (time < start) continue;
    const row = { ticket:id, time, type:deal.type, entry:deal.entry,
      profit:finite(deal.profit,'deal profit'),swap:finite(deal.swap,'deal swap'),commission:finite(deal.commission,'deal commission') };
    if (unique.has(id) && JSON.stringify(unique.get(id)) !== JSON.stringify(row)) throw new Error('Conflicting duplicate deal');
    unique.set(id,row);
  }
  const trading=[];
  for (const row of unique.values()) {
    if (['balance','credit','deposit','withdrawal'].includes(row.type)) continue;
    if (!['buy','sell'].includes(row.type) || !['in','out','inout','out_by'].includes(row.entry)) throw new Error('Unsupported target deal');
    trading.push(row);
  }
  const realized=addMoney(...trading.map(d=>addMoney(d.profit,d.swap,d.commission)));
  const ids=new Set(oldState.positions.map(p=>p.id));
  const targetPositions=positions.map(p=>{
    const id=targetPositionId(p.id);
    if(ids.has(id)) throw new Error('Position namespace collision');
    ids.add(id);
    if(!['buy','sell'].includes(p.type) || !p.symbol || finite(p.volume,'volume')<=0 || finite(p.openPrice,'open price')<=0 || finite(p.currentPrice,'current price')<=0) throw new Error('Invalid target position');
    finite(p.profit,'position profit');finite(p.swap,'position swap');
    if(!Number.isFinite(Date.parse(p.openTime)) || Date.parse(p.openTime)<start) throw new Error('Target position predates connection baseline');
    // Opening commission is posted by its deal, never charged again as floating P/L.
    return {...p,id,commission:0,origin:{kind:'broker',login:String(targetLogin),ticket:ticket(p.id)}};
  });
  const floating=addMoney(...targetPositions.map(p=>addMoney(p.profit,p.swap)));
  const margin=finite(account.margin,'target margin');
  if(margin<0) throw new Error('Negative target margin');
  const anchor=oldState.account;
  for(const key of ['balance','equity','freeMargin','margin','floatingProfit','marginLevel']) finite(anchor[key],`old ${key}`);
  const financialDelta=addMoney(realized,floating);
  const combinedMargin=addMoney(anchor.margin,margin);
  // Margin-level offsets require the captured raw broker basis before live use;
  // expose no guessed replacement for that independently configured percentage.
  return {
    account:{...anchor,balance:addMoney(anchor.balance,realized),equity:addMoney(anchor.equity,financialDelta),
      freeMargin:addMoney(anchor.freeMargin,financialDelta,-margin),margin:combinedMargin,
      floatingProfit:addMoney(anchor.floatingProfit,floating)},
    positions:[...oldState.positions,...targetPositions],
    accounting:{realized,floating,targetMargin:roundMoney(margin),marginLevelNeedsBasis:margin!==0||financialDelta!==0},
  };
}
