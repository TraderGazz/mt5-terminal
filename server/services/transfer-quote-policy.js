// Alfa-Forex regular RUB sessions, effective 2026-09-15: 09:05–18:55 MSK.
// https://alfaforex.ru/news/izmeneniya-v-raspisanie-po-rublevym-param/
// Only conversion may carry the final minute of the last completed session.
// Execution prices and quotes missing during an open session stay strict.
const DAY=86400000, MSK=3*3600000;
export function transferQuoteStatus(quote,{now=Date.now(),maxAgeMs=60000,conversion=false}={}) {
 const time=Date.parse(quote?.time);const ageMs=now-time;
 const valid=Number.isFinite(time)&&ageMs>=-5000&&Number.isFinite(quote?.bid)&&Number.isFinite(quote?.ask)&&quote.bid>0&&quote.ask>=quote.bid;
 if(!valid)return {fresh:false,usable:false,reason:'invalid',ageMs:Number.isFinite(ageMs)?ageMs:null};
 if(ageMs<=maxAgeMs)return {fresh:true,usable:true,reason:'fresh',ageMs};
 if(conversion&&quote.symbol==='USDRUBrfd') {
  const localNow=now+MSK;const dayStart=Math.floor(localNow/DAY)*DAY;
  const weekday=new Date(localNow).getUTCDay();const minute=(localNow-dayStart)/60000;
  const working=weekday>=1&&weekday<=5;
  if(!(working&&minute>=9*60+5&&minute<18*60+55)) {
   let lastDay=dayStart;
   if(!working||minute<18*60+55)lastDay-=DAY;
   while([0,6].includes(new Date(lastDay).getUTCDay()))lastDay-=DAY;
   const close=lastDay+(18*60+55)*60000;
   const localQuote=time+MSK;
   if(localQuote>=close-60000&&localQuote<=close)return {fresh:false,usable:true,reason:'conversion-session-close',ageMs};
  }
 }
 return {fresh:false,usable:false,reason:'stale',ageMs};
}
