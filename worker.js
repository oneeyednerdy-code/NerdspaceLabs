import { onRequestGet as twitchTrackerSummary } from './functions/api/twitchtracker-summary.js';

const HELIX_ORIGIN = 'https://api.twitch.tv';
const PREFIX = '/api/twitch/helix';
const ALLOWED = new Set([
  '/users','/streams','/streams/followed','/channels','/channels/followed',
  '/games','/videos','/clips','/schedule','/teams/channel','/search/categories','/channels/followers'
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
    if (url.pathname === '/api/twitchtracker-summary') {
      if (request.method !== 'GET') return error('Method not allowed.', 405);
      return twitchTrackerSummary({request, env, waitUntil: ctx.waitUntil.bind(ctx)});
    }
    return env.ASSETS.fetch(request);
  }
};