const CHANNEL_RE = /^[a-z0-9_]{1,25}$/;
const UPSTREAM = 'https://twitchtracker.com/api/channels/summary/';

function json(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': status === 200 ? 'public, max-age=300' : 'no-store',
      ...extraHeaders,
    },
  });
}

export async function onRequestGet(context) {
  const channel = new URL(context.request.url).searchParams.get('channel')?.trim().toLowerCase() || '';
  if (!CHANNEL_RE.test(channel)) return json({ error: 'Invalid Twitch channel login.' }, 400);

  try {
    const upstream = await fetch(`${UPSTREAM}${encodeURIComponent(channel)}`, {
      headers: {
        Accept: 'application/json',
        // TwitchTracker has historically rejected some generic server-side clients.
        // A normal UA improves compatibility without sending the user's Twitch token.
        'User-Agent': 'Mozilla/5.0 (compatible; Wormhole/0.0.91; +https://wormhole.nerdspacelabs.com)',
      },
      cf: { cacheTtl: 300, cacheEverything: true },
    });
    if (!upstream.ok) return json({ error: 'TwitchTracker did not return channel data.' }, upstream.status === 404 ? 404 : 502);
    const data = await upstream.json();
    return json(data, 200, { 'x-wormhole-data-source': 'twitchtracker' });
  } catch {
    return json({ error: 'TwitchTracker is temporarily unavailable.' }, 502);
  }
}
