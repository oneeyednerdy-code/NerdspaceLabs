export function comparePeriods(current=[],previous=[]){
 const avg=a=>a.length?a.reduce((s,x)=>s+Number(x||0),0)/a.length:0;
 const c=avg(current),p=avg(previous);
 return {current:Number(c.toFixed(1)),previous:Number(p.toFixed(1)),changePercent:p?Number((((c-p)/p)*100).toFixed(1)):null,samples:{current:current.length,previous:previous.length}};
}