import { APP_CONFIG } from '../../config.js';

export async function getTwitchTrackerSummary(login) {
  if (!login) return null;
  const url = new URL(APP_CONFIG.twitchTrackerUrl);
  url.searchParams.set('channel', login);
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    return r.json();
  } catch { return null; }
}