export const PRESETS={
 raid:{audience:30,game:25,tags:20,language:10,relationship:10,other:5},
 collaboration:{schedule:30,games:25,tags:20,audience:15,patterns:10},
 discovery:{games:25,tags:25,audience:20,networkGap:20,other:10}
};
export function weightedScore(parts,weights){
 let score=0,total=0,explanation=[];
 for(const [key,w] of Object.entries(weights)){const value=Number(parts[key]??50);score+=value*w;total+=w;explanation.push({signal:key,value,weight:w});}
 return {score:total?Math.round(score/total):0,explanation};
}