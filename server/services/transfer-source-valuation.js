import { roundMoney, addMoney } from './money.js';
import { applyPositionOverride } from './position-view.js';
import { valueTransferredPosition } from './transfer-staging.js';

// Preserve the first site's existing presentation/account conventions without
// contacting the old broker. Actual execution valuation remains a separate API.
export function createSourceCompatibleValuation(saved,positions) {
  const payload=saved.payload;
  if(!payload?.referenceQuotes) return null; // older inspection fixtures
  const fx=payload.referenceQuotes.USDRUBrfd;
  const rows=payload.settings?.position_overrides;
  if(!fx || !Number.isFinite(fx.bid) || !Number.isFinite(fx.ask) || fx.bid<=0 || fx.ask<fx.bid || !Array.isArray(rows))throw new Error('Source valuation requires captured FX and position overrides');
  const overrides=new Map(rows.map(row=>[String(row.ticket),{
    openPriceOverride:row.open_price_override==null?null:Number(row.open_price_override),
    profitOffset:row.profit_offset==null?null:Number(row.profit_offset),
    swapOffset:row.swap_offset==null?null:Number(row.swap_offset),
    volumeOverride:row.volume_override==null?null:Number(row.volume_override),
  }]));
  for(const {model:m} of positions) {
    if(m.valuation.profitCurrency!=='USD'||m.valuation.accountCurrency!=='RUB'||m.valuation.conversionSymbol!=='USDRUBrfd') {
      throw new Error('Unsupported source-compatible conversion');
    }
  }
  function calculate(m,quote,conversion) {
    const direction=m.raw.type==='buy'?1:-1;
    const close=m.raw.type==='buy'?quote.bid:quote.ask;
    const dollars=direction*(close-m.raw.openPrice)*m.valuation.units;
    // MT5 converts a USD loss at USDRUB Ask and a gain at Bid.
    const brokerProfit=roundMoney(dollars*(dollars<0?conversion.ask:conversion.bid));
    // Existing source bridge fixes SELL at Bid using midpoint conversion.
    const fixedProfit=m.raw.type==='sell'?
      (m.raw.openPrice-quote.bid)*m.valuation.units*(conversion.bid+conversion.ask)/2:brokerProfit;
    const raw={...m.raw,currentPrice:quote.bid,profit:fixedProfit};
    const api=applyPositionOverride(raw,overrides.get(String(m.originalTicket)));
    return {brokerProfit,fixedProfit,api};
  }
  const anchors=positions.map(({model:m})=>{
    const quote={bid:m.raw.currentPrice,ask:m.raw.currentPrice};
    // Ask is unnecessary for the source API baseline: SELL's fixed profit
    // uses Bid; BUY's original broker-rounded profit is captured exactly.
    const a=calculate(m,quote,fx);
    if(m.raw.type==='buy') {
      a.fixedProfit=m.raw.profit;
      a.api=applyPositionOverride({...m.raw,profit:m.raw.profit},overrides.get(String(m.originalTicket)));
    }
    return a;
  });
  return function value(quotes,options={}) {
    const apiPositions=[],displayed=[];
    let delta=0,brokerDelta=0;
    positions.forEach(({model:m},i)=>{
      // Validate both quotes and their age through the execution core first.
      valueTransferredPosition(m,quotes,options);
      const current=calculate(m,quotes[m.raw.symbol],quotes.USDRUBrfd);
      const anchor=anchors[i];
      const correction=m.view.profit-anchor.api.profit;
      const api={...m.view,...current.api,profit:current.api.profit+correction,
        swap:m.view.swap,commission:m.view.commission};
      const close=m.raw.type==='buy'?quotes[m.raw.symbol].bid:quotes[m.raw.symbol].ask;
      const move=api.currentPrice-api.openPrice;
      // Matches Trade.tsx's existing display repricing, including fixed offsets.
      const displayProfit=move!==0?api.profit/move*(close-api.openPrice):0;
      apiPositions.push(api);
      displayed.push({...api,currentPrice:close,profit:roundMoney(displayProfit),swap:roundMoney(api.swap),commission:roundMoney(api.commission)});
      brokerDelta+=current.brokerProfit-m.raw.profit;
      delta+=current.brokerProfit-m.raw.profit+
        (api.profit-current.fixedProfit)-(m.view.profit-anchor.fixedProfit);
    });
    return {positions:displayed,apiPositions,accountDelta:roundMoney(delta),brokerProfitDelta:roundMoney(brokerDelta),
      profit:addMoney(...displayed.map(p=>p.profit)),swap:addMoney(...displayed.map(p=>p.swap)),
      commission:addMoney(...displayed.map(p=>p.commission)),mode:'source-compatible'};
  };
}
