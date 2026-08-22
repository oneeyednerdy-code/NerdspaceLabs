# Data classification

| Data | Pre-D1 location | Proposed 2.0 persistence | Notes |
|---|---|---|---|
| OAuth access token | sessionStorage | Never analytics/D1 | Session credential |
| UI preferences | localStorage | Optional | User-controlled |
| Public Twitch profile | transient/cache | Minimal | Refreshable public data |
| Stream history | current Twitch response | Opt-in | Needed for long-term patterns |
| Creator notes | local only | Optional | Private user content |
| Experiments | local only | Optional | User-created |
| Diagnostics | generated on demand | No default storage | Sanitized |
