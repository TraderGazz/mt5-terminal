/** A close-triggered history read must win over an older polling request. */
export function createHistoryRefresh<T>(load:()=>Promise<T>,receive:(data:T)=>void,failed:()=>void) {
  let revision=0;
  return async()=>{
    const current=++revision;
    try{const data=await load();if(current===revision)receive(data);}
    catch{if(current===revision)failed();}
  };
}

/** Align the live upper history boundary with the server that stamped closes. */
export function createHistoryClock(localNow:()=>number=Date.now) {
  let serverTime:number|null=null,observedAt=0;
  return {
    observe(value?:string){const parsed=Date.parse(value||'');if(Number.isFinite(parsed)){serverTime=parsed;observedAt=localNow();}},
    now(){const local=localNow();return serverTime==null?local:serverTime+Math.max(0,local-observedAt);},
  };
}
