# Nerdspace Labs Dashboard — Alpha 0.1.0

A Twitch creator command center by OneEyedNerdy.

This is the **pre-D1 / local-first foundation**. It borrows the proven architecture and visual language developed across Wormhole, NerdSync and Solstice while establishing a shared dashboard data layer.

## Included in 1.0.0

- Twitch OAuth login
- Same-origin Cloudflare Worker gateway for approved Twitch Helix GET endpoints
- TwitchTracker summary gateway
- Mission Control
- Raid Radar foundation
- Game Radar foundation
- Schedule Lab with published schedule + observed VOD fallback
- Signals engine
- sanitized diagnostic TXT download
- local-first privacy controls
- modular JavaScript
- Cloudflare Workers static asset deployment
- automated build + tests

## Deliberately not included

- D1
- server-side creator profiles
- persistent analytics history
- saved raid/collaboration history
- cross-device sync
- claims that a recommendation will grow a channel

See `CLOUDFLARE_SETUP.txt` for deployment.


## Phase 6: Stable Pre-D1

Ship a stable local-first Nerdspace Dashboard that remains useful without a Nerdspace account or server-side history.

D1 remains disabled.
