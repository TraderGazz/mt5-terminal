// Read-only weekend snapshot policy. Never used for execution or settlements.
export function weekendValuationTime(quotes,symbols,now){
 const day=new Date(now+10800000).getUTCDay();if(day!==0&&day!==6)return null;
 const today=new Date(now);today.setUTCHours(0,0,0,0);
 const friday=today.getTime()-(day===6?1:2)*86400000;
 const times=[...symbols].map(symbol=>Date.parse(quotes[symbol]?.time));
 if(!times.length||times.some(t=>!Number.isFinite(t)||t<friday||t>=friday+86400000))return null;
 const latest=Math.max(...times);if(times.some(t=>latest-t>60000))return null;
 return latest;
}
