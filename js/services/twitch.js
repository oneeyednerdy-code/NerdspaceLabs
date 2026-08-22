import { APP_CONFIG } from '../../config.js';
import { getToken } from '../auth.js';

export async function helix(path, params = {}) {
  const token = getToken();
  if (!token) throw new Error('Not connected to Twitch.');
  const url = new URL(APP_CONFIG.apiBaseUrl + path);
  for (const [k,v] of Object.entries(params)) {
    if (Array.isArray(v)) v.forEach(x => url.searchParams.append(k, x));
    else if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);
  }
  const r = await fetch(url, {headers:{Authorization:`Bearer ${token}`}});
  if (!r.ok) {
    let message = `Twitch request failed (${r.status}).`;
    try { const b = await r.json(); message = b.message || b.error || message; } catch {}
    throw new Error(message);
  }
  return r.json();
}

export async function getUser(id) {
  const body = await helix('/users', id ? {id} : {});
  return body.data?.[0] || null;
}

export async function getChannel(id) {
  const body = await helix('/channels', {broadcaster_id:id});
  return body.data?.[0] || null;
}

export async function getStream(id) {
  const body = await helix('/streams', {user_id:id});
  return body.data?.[0] || null;
}

export async function getRecentVideos(id, first=20) {
  const body = await helix('/videos', {user_id:id, type:'archive', first:String(first)});
  return body.data || [];
}

export async function getGames(ids) {
  const unique = [...new Set(ids.filter(Boolean))].slice(0,100);
  if (!unique.length) return [];
  const body = await helix('/games', {id:unique});
  return body.data || [];
}

export async function getFollowedStreams(userId, first=100) {
  const body = await helix('/streams/followed', {user_id:userId, first:String(first)});
  return body.data || [];
}

export async function getSchedule(id) {
  try {
    const body = await helix('/schedule', {broadcaster_id:id, first:'25'});
    return body.data?.segments || [];
  } catch { return []; }
}