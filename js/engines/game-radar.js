function normalize(name='') { return String(name).trim().toLowerCase(); }

// Twitch Get Videos does not expose game/category IDs. Pre-D1 category evidence therefore
// comes from Twitch clips (which do expose game_id), the current channel category, and live network data.
export function summarizeGameHistory(clips=[], games=[], channel=null) {
  const names = new Map(games.map(g => [String(g.id), g.name]));
  const map = new Map();
  for (const c of clips) {
    const id=String(c.game_id||''); if(!id) continue;
    const name=names.get(id)||'Unknown category';
    const current=map.get(id)||{id,name,clips:0,clipViews:0};
    current.clips+=1; current.clipViews+=Number(c.view_count||0); map.set(id,current);
  }
  if(channel?.game_id){const id=String(channel.game_id);const current=map.get(id)||{id,name:channel.game_name||names.get(id)||'Current category',clips:0,clipViews:0};current.current=true;map.set(id,current)}
  return [...map.values()].map(x=>({...x,avgClipViews:x.clips?Math.round(x.clipViews/x.clips):0}))
    .sort((a,b)=>Number(b.current)-Number(a.current)||b.clips-a.clips||b.avgClipViews-a.avgClipViews);
}

export function buildGameSignals(history=[], followedStreams=[], trackerGames=new Map()) {
  const own = new Set(history.map(x=>normalize(x.name)));
  const live = new Map();
  for (const s of followedStreams) {
    if (!s.game_name || own.has(normalize(s.game_name))) continue;
    const x = live.get(s.game_name) || {name:s.game_name,id:String(s.game_id||''),channels:0,viewers:0};
    x.channels += 1; x.viewers += Number(s.viewer_count||0); live.set(s.game_name,x);
  }
  return [...live.values()].map(x=>{
    const tt=trackerGames.get(x.id)||trackerGames.get(x.name)||null;
    const base=45+Math.min(30,x.channels*6)+Math.min(24,Math.round(Math.log10(x.viewers+1)*8));
    return {...x,tracker:tt,score:Math.min(99,base)};
  }).sort((a,b)=>b.score-a.score).slice(0,12);
}
