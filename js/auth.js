import { APP_CONFIG, getRedirectUri } from '../config.js';

const TOKEN_KEY = 'nerdspace:twitch-token';

function randomState() {
  const a = new Uint32Array(4); crypto.getRandomValues(a);
  return [...a].map(x => x.toString(16)).join('');
}

export function getToken() { return sessionStorage.getItem(TOKEN_KEY) || ''; }

export function beginLogin() {
  if (!APP_CONFIG.twitchClientId || APP_CONFIG.twitchClientId.includes('REPLACE_')) {
    throw new Error('Add your Twitch Client ID to config.js before connecting Twitch.');
  }
  const state = randomState();
  sessionStorage.setItem('nerdspace:oauth-state', state);
  const url = new URL(APP_CONFIG.oauthAuthorizeUrl);
  url.searchParams.set('client_id', APP_CONFIG.twitchClientId);
  url.searchParams.set('redirect_uri', getRedirectUri());
  url.searchParams.set('response_type', 'token');
  url.searchParams.set('scope', APP_CONFIG.scopes.join(' '));
  url.searchParams.set('state', state);
  location.assign(url);
}

export function consumeOAuthHash() {
  if (!location.hash.includes('access_token=')) return false;
  const p = new URLSearchParams(location.hash.slice(1));
  const token = p.get('access_token');
  const state = p.get('state');
  const expected = sessionStorage.getItem('nerdspace:oauth-state');
  history.replaceState(null, '', location.pathname + location.search);
  sessionStorage.removeItem('nerdspace:oauth-state');
  if (!token || !expected || state !== expected) throw new Error('Twitch login state did not match.');
  sessionStorage.setItem(TOKEN_KEY, token);
  return true;
}

export async function validateToken() {
  const token = getToken();
  if (!token) return null;
  const r = await fetch(APP_CONFIG.twitchValidateUrl, {headers:{Authorization:`OAuth ${token}`}});
  if (!r.ok) { logout(); return null; }
  return r.json();
}

export function logout() {
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem('nerdspace:oauth-state');
}