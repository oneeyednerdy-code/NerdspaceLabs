const norm=v=>String(v??'').trim().toLowerCase();
const list=v=>Array.isArray(v)?v:[];
export function filterCreators(creators=[],filters={}){
  const q=norm(filters.search), games=new Set(list(filters.games).map(norm)), tags=list(filters.tags).map(norm).filter(Boolean);
  const language=norm(filters.language), genres=list(filters.genres).map(norm).filter(Boolean), min=Number(filters.minViewers||0), max=Number(filters.maxViewers||0);
  const labels=list(filters.contentLabels).map(norm).filter(Boolean);
  return creators.filter(c=>{
    const name=norm(c.user_name||c.display_name||c.broadcaster_name||c.login);
    const login=norm(c.user_login||c.login||c.broadcaster_login);
    const title=norm(c.title);
    if(q && !name.includes(q) && !login.includes(q) && !title.includes(q)) return false;
    if(games.size && !games.has(norm(c.game_name))) return false;
    const ct=list(c.tags).map(norm);
    if(tags.length && !tags.every(t=>ct.some(x=>x.includes(t)))) return false;
    if(language && norm(c.language||c.broadcaster_language)!==language) return false;
    const cg=list(c.genres).map(norm); if(genres.length && !genres.some(g=>cg.includes(g))) return false;
    const viewers=Number(c.viewer_count||0);
    if(min && viewers<min) return false;
    if(max && viewers>max) return false;
    const ccl=list(c.content_classification_labels).map(norm);
    if(labels.length && labels.some(x=>ccl.includes(x))) return false;
    return true;
  });
}
export function uniqueOptions(creators=[],key){
  return [...new Set(creators.flatMap(c=>key==='tags'?(c.tags||[]):[c[key]]).filter(Boolean).map(String))].sort((a,b)=>a.localeCompare(b));
}
