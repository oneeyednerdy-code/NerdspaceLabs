import { onRequestGet as twitchTrackerSummary } from './functions/api/twitchtracker-summary.js';
import { onRequestGet as twitchTrackerGameSummary } from './functions/api/twitchtracker-game-summary.js';

const HELIX_ORIGIN = 'https://api.twitch.tv';
const IGDB_ORIGIN = 'https://api.igdb.com/v4';
let igdbTokenCache = { token:'', expiresAt:0 };

async function getIgdbToken(env){
  const now=Date.now();
  if(igdbTokenCache.token && igdbTokenCache.expiresAt > now + 300000) return igdbTokenCache.token;
  if(!env.TWITCH_CLIENT_ID || !env.IGDB_CLIENT_SECRET) throw new Error('IGDB credentials are not configured.');
  const u=new URL('https://id.twitch.tv/oauth2/token');
  u.searchParams.set('client_id',env.TWITCH_CLIENT_ID);
  u.searchParams.set('client_secret',env.IGDB_CLIENT_SECRET);
  u.searchParams.set('grant_type','client_credentials');
  const r=await fetch(u,{method:'POST'});
  if(!r.ok) throw new Error('IGDB application authentication failed.');
  const b=await r.json();
  igdbTokenCache={token:b.access_token,expiresAt:now+Math.max(300,Number(b.expires_in||3600))*1000};
  return igdbTokenCache.token;
}
async function igdbGames(request,env){
  if(request.method!=='POST') return error('Method not allowed.',405);
  let body; try{body=await request.json()}catch{return error('Invalid JSON.',400)}
  const ids=[...new Set((body.ids||[]).map(String).filter(x=>/^\d+$/.test(x)))].slice(0,100);
  if(!ids.length) return new Response('[]',{headers:{'content-type':'application/json','cache-control':'public, max-age=86400'}});
  try{
    const token=await getIgdbToken(env);
    const query=`fields id,name,genres.name,genres.slug,themes.name,game_modes.name,player_perspectives.name,summary,cover.image_id; where id = (${ids.join(',')}); limit 100;`;
    const r=await fetch(IGDB_ORIGIN+'/games',{method:'POST',headers:{'Client-ID':env.TWITCH_CLIENT_ID,'Authorization':`Bearer ${token}`,'Accept':'application/json','Content-Type':'text/plain'},body:query});
    const text=await r.text();
    return new Response(text,{status:r.status,headers:{'content-type':'application/json; charset=utf-8','cache-control':r.ok?'public, max-age=86400':'no-store'}});
  }catch(e){return error(e.message||'IGDB is temporarily unavailable.',502)}
}
const PREFIX = '/api/twitch/helix';
const ALLOWED = new Set([
  '/users','/streams','/streams/followed','/channels','/channels/followed',
  '/games','/videos','/clips','/schedule','/teams/channel','/search/categories','/search/channels','/channels/followers'
]);

function error(message, status = 400) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: {'content-type':'application/json; charset=utf-8','cache-control':'no-store'}
  });
}

async function proxy(request, env) {
  const incoming = new URL(request.url);
  const path = incoming.pathname.slice(PREFIX.length) || '/';
  if (!ALLOWED.has(path)) return error('Unsupported Twitch API endpoint.', 404);
  if (!['GET'].includes(request.method)) return error('Method not allowed.', 405);

  const authorization = request.headers.get('authorization');
  if (!authorization?.startsWith('Bearer ')) return error('Twitch authorization is required.', 401);

  const clientId = env.TWITCH_CLIENT_ID;
  if (!clientId || clientId.includes('REPLACE_')) return error('Twitch Client ID is not configured.', 500);

  const upstream = new URL('/helix' + path, HELIX_ORIGIN);
  upstream.search = incoming.search;
  try {
    const response = await fetch(upstream, {
      headers: {
        authorization,
        'client-id': clientId,
        accept: 'application/json'
      }
    });
    const headers = new Headers({
      'content-type': response.headers.get('content-type') || 'application/json; charset=utf-8',
      'cache-control': 'no-store'
    });
    for (const h of ['ratelimit-limit','ratelimit-remaining','ratelimit-reset']) {
      const v = response.headers.get(h); if (v) headers.set(h, v);
    }
    return new Response(response.body, {status: response.status, headers});
  } catch {
    return error('Twitch API is temporarily unavailable.', 502);
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname.startsWith(PREFIX + '/')) return proxy(request, env);
    if (url.pathname === '/api/igdb/games') return igdbGames(request, env);
    if (url.pathname === '/api/twitchtracker-game-summary') {
      if (request.method !== 'GET') return error('Method not allowed.', 405);
      return twitchTrackerGameSummary({request, env, waitUntil: ctx.waitUntil.bind(ctx)});
    }
    if (url.pathname === '/api/twitchtracker-summary') {
      if (request.method !== 'GET') return error('Method not allowed.', 405);
      return twitchTrackerSummary({request, env, waitUntil: ctx.waitUntil.bind(ctx)});
    }
    return env.ASSETS.fetch(request);
  }
};