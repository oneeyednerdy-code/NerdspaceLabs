export function categoryConditions({viewers=0,channels=0,typicalAudience=0}={}){
 const ratio=channels?viewers/channels:0;
 const estimatedPosition=typicalAudience&&channels?Math.min(100,Math.round((typicalAudience/(ratio||1))*50)):null;
 return {viewers,channels,viewersPerChannel:Number(ratio.toFixed(1)),estimatedPosition,
   note:'Current category conditions are context, not a prediction of growth.'};
}