export async function getIGDBGames(igdbIds=[]){
  const ids=[...new Set(igdbIds.map(String).filter(Boolean))].slice(0,100);
  if(!ids.length) return [];
  const r=await fetch('/api/igdb/games',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({ids})});
  if(!r.ok){let m=`IGDB request failed (${r.status})`;try{const b=await r.json();m=b.error||m}catch{}throw new Error(m)}
  return r.json();
}

export async function searchIGDBGames(query,limit=12){
  const q=String(query||'').trim();
  if(q.length<2)return [];
  const r=await fetch('/api/igdb/search',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({query:q,limit})});
  if(!r.ok){let m=`IGDB search failed (${r.status})`;try{const b=await r.json();m=b.error||m}catch{}throw new Error(m)}
  return r.json();
}
