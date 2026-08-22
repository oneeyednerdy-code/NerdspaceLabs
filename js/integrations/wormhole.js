function pctDiff(a,b){const base=Math.max(Number(a)||0,1);return Math.abs((Number(a)||0)-(Number(b)||0))/base*100}
function durationHours(s){if(!s?.started_at)return 0;return Math.max(0,(Date.now()-new Date(s.started_at).getTime())/36e5)}
function tags(a=[]){return new Set(a.map(x=>String(x).trim().toLowerCase()).filter(Boolean))}
export function tagSimilarity(a=[],b=[]){const A=tags(a),B=tags(b);if(!A.size)return {score:null,shared:[]};const shared=[...A].filter(x=>B.has(x));const union=new Set([...A,...B]);return {score:Math.round(((shared.length/A.size)*.7+(shared.length/Math.max(1,union.size))*.3)*100),shared}}
export function rankRaidCandidates(reference,candidates=[],profiles=new Map()){
 if(!reference)return [];
 return candidates.filter(c=>c.user_id!==reference.user_id).map(c=>{
  const live=Math.max(0,100-pctDiff(reference.viewer_count,c.viewer_count));
  const dur=Math.max(0,100-(Math.abs(durationHours(reference)-durationHours(c))/6*100));
  const t=tagSimilarity(reference.tags,c.tags);
  const game=reference.game_id&&reference.game_id===c.game_id?100:0;
  const score=Math.round(live*.45+dur*.15+(t.score??50)*.15+game*.25);
  const profile=profiles.get(c.user_id)||{};
  return {...c,broadcaster_type:profile.broadcaster_type||'',raidScore:score,raidEvidence:{live:Math.round(live),duration:Math.round(dur),tags:t.score,sharedTags:t.shared,game}};
 }).sort((a,b)=>b.raidScore-a.raidScore);
}
