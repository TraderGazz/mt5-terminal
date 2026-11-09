// Public acceptance preview is intentionally read-only. Its history remains the
// captured first-site history; stop rather than show incomplete new trade history.
export function createHybridReviewState(read,{now=Date.now,cacheMs=3000}={}){
 let pending,cached,at=0;
 return async()=>{
  if(cached&&now()-at<cacheMs)return cached;
  if(pending)return pending;
  pending=(async()=>{
   const state=await read();
   if(state.source.targetPositions||state.source.targetTradingDeals){
    const error=new Error('На новом счёте появились сделки. Просмотр приостановлен до подключения их истории.');error.status=503;throw error;
   }
   cached=state;at=now();return state;
  })().finally(()=>{pending=null;});
  return pending;
 };
}
