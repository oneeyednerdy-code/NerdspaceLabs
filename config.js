export const APP_CONFIG = {
  name: 'Nerdspace Labs Dashboard',
  version: '1.21.3',
  twitchClientId: '1ttjf7d3zcz71caav9zg9mf2x6uj18',
  scopes: ['user:read:follows'],
  oauthAuthorizeUrl: 'https://id.twitch.tv/oauth2/authorize',
  twitchValidateUrl: 'https://id.twitch.tv/oauth2/validate',
  apiBaseUrl: `${globalThis.location?.origin ?? 'http://localhost'}/api/twitch/helix`,
  twitchTrackerUrl: `${globalThis.location?.origin ?? 'http://localhost'}/api/twitchtracker-summary`,
  twitchTrackerGameUrl: `${globalThis.location?.origin ?? 'http://localhost'}/api/twitchtracker-game-summary`,
  storagePrefix: 'nerdspace:'
};

export function getRedirectUri(location = globalThis.location) {
  if (!location?.origin || !/^https?:\/\//i.test(location.origin)) {
    throw new Error('Nerdspace must be served from HTTPS or localhost for Twitch login.');
  }
  return new URL('/', location.origin).toString();
}