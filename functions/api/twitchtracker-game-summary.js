const GAME_RE = /^[a-zA-Z0-9 _:'+.&!()-]{1,120}$/;
const UPSTREAM = 'https://twitchtracker.com/api/games/summary/';
function json(body,status=200){return new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':status===200?'public, max-age=900':'no-store'}})}
export async function onRequestGet(context){
 const game=(new URL(context.request.url).searchParams.get('game')||'').trim();
 if(!GAME_RE.test(game)) return json({error:'Invalid game id or name.'},400);
 try{
  const r=await fetch(UPSTREAM+encodeURIComponent(game),{headers:{Accept:'application/json','User-Agent':'Mozilla/5.0 (compatible; NerdspaceLabs/1.10.2)'},cf:{cacheTtl:900,cacheEverything:true}});
  if(!r.ok) return json({error:'TwitchTracker did not return game data.'},r.status===404?404:502);
  return json(await r.json());
 }catch{return json({error:'TwitchTracker game context is temporarily unavailable.'},502)}
}
