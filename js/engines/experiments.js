export function summarizeExperiment(before=[],after=[]){
 const avg=a=>a.length?a.reduce((s,x)=>s+Number(x||0),0)/a.length:0;
 const b=avg(before),a=avg(after),delta=b?((a-b)/b)*100:null;
 const sample=before.length+after.length;
 return {before:Number(b.toFixed(1)),after:Number(a.toFixed(1)),deltaPercent:delta===null?null:Number(delta.toFixed(1)),
   sample,confidence:sample>=12?'moderate':sample>=6?'limited':'very limited',
   caution:'Observed difference is correlation, not proof that the tested change caused the result.'};
}