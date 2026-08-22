# D1 Readiness — design only

**D1 is NOT enabled in this release.**

## Proposed opt-in data classes
- user settings and consent version
- stream snapshots needed for long-term comparisons
- saved creators/matches
- experiments and observations
- optional raid/collaboration history

## Rules before enabling D1
1. Persistence must be opt-in and Local Mode remains usable.
2. OAuth access tokens are not analytics records and must not be stored in D1.
3. Define retention per table before collection begins.
4. Provide deletion and export paths.
5. Store Twitch user IDs as stable keys; display names are mutable presentation data.
6. Keep raw data only when a feature genuinely requires it; prefer derived aggregates where possible.
7. Migration scripts require forward and rollback plans.
8. Production and preview databases must be separate.

## Proposed tables
- users(id, twitch_user_id, created_at, consent_version)
- preferences(user_id, json, updated_at)
- stream_snapshots(id, user_id, twitch_stream_id, started_at, game_id, avg_viewers, peak_viewers, duration_seconds)
- saved_creators(user_id, creator_twitch_id, label, created_at)
- experiments(id, user_id, title, metric, started_at, ended_at, status)
- experiment_observations(experiment_id, stream_snapshot_id, cohort)

This document is a schema proposal, not an active database configuration.
