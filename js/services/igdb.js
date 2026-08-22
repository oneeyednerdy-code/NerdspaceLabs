export async function getIGDBGames(igdbIds=[]){
  const ids=[...new Set(igdbIds.map(String).filter(Boolean))].slice(0,100);
  if(!ids.length) return [];
  const r=await fetch('/api/igdb/games',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({ids})});
  if(!r.ok){let m=`IGDB request failed (${r.status})`;try{const b=await r.json();m=b.error||m}catch{}throw new Error(m)}
  return r.json();
}
