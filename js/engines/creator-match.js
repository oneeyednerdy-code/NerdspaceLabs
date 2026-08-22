const overlap=(a=[],b=[])=>{const B=new Set(b.map(x=>String(x).toLowerCase()));return a.filter(x=>B.has(String(x).toLowerCase())).length};
export function creatorMatch(me,other,{audienceWeight=30,gameWeight=25,tagWeight=25,scheduleWeight=20}={}) {
  const av=Number(me?.current?.viewers||0), bv=Number(other?.current?.viewers||0);
  const audience=(!av||!bv)?50:Math.max(0,100-Math.round(Math.abs(av-bv)/Math.max(av,bv)*100));
  const game=me?.current?.game && me.current.game===other?.current?.game ? 100:0;
  const shared=overlap(me?.current?.tags||[],other?.current?.tags||[]);
  const tags=Math.min(100,shared*20);
  const schedule=50; // neutral until both creators have comparable evidence
  const total=Math.round((audience*audienceWeight+game*gameWeight+tags*tagWeight+schedule*scheduleWeight)/100);
  return {total,audience,game,tags,schedule,sharedTags:shared,reasons:[
    `${audience}% audience similarity`, game? 'Same current game':'Different current game',
    `${shared} shared tags`, 'Schedule stays neutral until comparable evidence exists'
  ]};
}