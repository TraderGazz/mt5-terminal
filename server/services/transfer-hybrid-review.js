// Public acceptance preview is intentionally read-only. Its history remains the
// captured first-site history plus validated new-account history.
export function createHybridReviewState(read,{now=Date.now,cacheMs=3000}={}){
 let pending,cached,at=0;
 return async()=>{
  if(cached&&now()-at<cacheMs)return cached;
  if(pending)return pending;
  pending=(async()=>{
   const state=await read();
   if(!state.targetHistory)throw new Error('Complete target history required');
   cached=state;at=now();return state;
  })().finally(()=>{pending=null;});
  return pending;
 };
}
