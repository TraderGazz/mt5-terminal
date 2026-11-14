import {addMoney,cents} from './money.js';
import {targetPositionId} from './transfer-hybrid-rehearsal.js';

// Hedge-account history from a complete normalized post-baseline deal set.
// Opening fees are allocated across partial closes in integer kopecks; the
// unallocated remainder remains a separate charge, never a fake closed position.
export function buildTargetHistory(deals,{startedAt}={}){
 const start=Date.parse(startedAt);if(!Number.isFinite(start))throw new Error('Invalid history baseline');
 const unique=new Map();
 for(const d of deals){
  if(!Number.isFinite(Date.parse(d.time)))throw new Error('Invalid history time');
  if(Date.parse(d.time)<start||!['buy','sell'].includes(d.type))continue;
  const key=targetPositionId(d.ticket);
  if(unique.has(key)&&JSON.stringify(unique.get(key))!==JSON.stringify(d))throw new Error('Conflicting target history duplicate');
  unique.set(key,d);
 }
 const sorted=[...unique.values()].sort((a,b)=>Date.parse(a.time)-Date.parse(b.time)||a.ticket-b.ticket);
 const rows=[],legs=[],charges=[],groups=new Map();
 for(const d of sorted){
  const id=targetPositionId(d.ticket),positionId=targetPositionId(d.positionId);
  if(!d.symbol||!Number.isFinite(d.volume)||d.volume<=0||!Number.isFinite(d.price)||d.price<=0)throw new Error('Invalid target trade details');
  const units=Math.round(d.volume*1e8);if(!Number.isSafeInteger(units)||units<=0||Math.abs(units/1e8-d.volume)>1e-9)throw new Error('Invalid trade volume precision');
  if(!groups.has(positionId))groups.set(positionId,[]);
  const lots=groups.get(positionId);
  legs.push({id,ticket:id,positionId,orderTicket:d.orderTicket?targetPositionId(d.orderTicket):null,symbol:d.symbol,type:d.type,entry:d.entry,dealType:d.type,
   volume:d.volume,price:d.price,stopLoss:d.stopLoss||0,takeProfit:d.takeProfit||0,profit:d.profit,swap:d.swap,commission:d.commission,time:d.time,comment:d.comment||'',isEdited:false});
  if(d.entry==='in'){
   if(d.profit!==0||d.swap!==0||lots.some(l=>l.units>0&&(l.deal.type!==d.type||l.deal.symbol!==d.symbol)))throw new Error('Unsupported target opening financial result');
   lots.push({deal:d,units,fee:cents(d.commission)});continue;
  }
  if(!['out','out_by'].includes(d.entry))throw new Error('Only hedge in/out history is supported');
  let remaining=units,openingFee=0,weightedPrice=0,first;
  for(const lot of lots){
   if(!remaining)break;if(!lot.units)continue;
   if(lot.deal.type===d.type||lot.deal.symbol!==d.symbol)throw new Error('Invalid target closing side/symbol');
   const used=Math.min(remaining,lot.units);
   const numerator=BigInt(Math.abs(lot.fee))*BigInt(used),denominator=BigInt(lot.units);
   const fee=used===lot.units?lot.fee:Math.sign(lot.fee)*Number((2n*numerator+denominator)/(2n*denominator));
   openingFee+=fee;lot.fee-=fee;weightedPrice+=lot.deal.price*used;
   first??=lot.deal;lot.units-=used;remaining-=used;
  }
  if(remaining||!first)throw new Error('Incomplete target opening history');
  rows.push({id,ticket:id,positionId,orderTicket:d.orderTicket?targetPositionId(d.orderTicket):null,symbol:d.symbol,dealType:first.type,volume:d.volume,
   openPrice:weightedPrice/units,closePrice:d.price,stopLoss:d.stopLoss||0,takeProfit:d.takeProfit||0,profit:d.profit,swap:d.swap,
   commission:addMoney(d.commission,openingFee/100),openTime:first.time,closeTime:d.time,comment:d.comment||'',isEdited:false});
 }
 for(const [positionId,lots]of groups)for(const lot of lots)if(lot.fee)charges.push({ticket:targetPositionId(lot.deal.ticket),positionId,symbol:lot.deal.symbol,
  time:lot.deal.time,commission:lot.fee/100,profit:0,swap:0});
 const openPositions=[];for(const [id,lots]of groups){const active=lots.filter(l=>l.units>0);if(active.length)openPositions.push({id,volume:active.reduce((sum,l)=>sum+l.units,0)/1e8,symbol:active[0].deal.symbol,type:active[0].deal.type});}
 return {rows,legs,charges,openPositions};
}
