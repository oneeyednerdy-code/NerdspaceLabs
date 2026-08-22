function normalize(name='') { return name.trim().toLowerCase(); }

export function summarizeGameHistory(videos=[], games=[]) {
  const names = new Map(games.map(g => [g.id, g.name]));
  const map = new Map();
  for (const v of videos) {
    if (!v.game_id) continue;
    const name = names.get(v.game_id) || 'Unknown category';
    const current = map.get(v.game_id) || {id:v.game_id,name,streams:0,views:0};
    current.streams += 1;
    current.views += Number(v.view_count || 0);
    map.set(v.game_id,current);
  }
  return [...map.values()].map(x => ({...x,avgVodViews:Math.round(x.views/x.streams)}))
    .sort((a,b)=>b.streams-a.streams || b.avgVodViews-a.avgVodViews);
}

export function buildGameSignals(history=[], followedStreams=[]) {
  const own = new Set(history.map(x=>normalize(x.name)));
  const live = new Map();
  for (const s of followedStreams) {
    if (!s.game_name || own.has(normalize(s.game_name))) continue;
    const x = live.get(s.game_name) || {name:s.game_name,channels:0,viewers:0};
    x.channels += 1; x.viewers += Number(s.viewer_count||0); live.set(s.game_name,x);
  }
  return [...live.values()]
    .map(x=>({...x,score:Math.min(99, 45 + Math.min(30,x.channels*6) + Math.min(24,Math.round(Math.log10(x.viewers+1)*8)))}))
    .sort((a,b)=>b.score-a.score).slice(0,8);
}