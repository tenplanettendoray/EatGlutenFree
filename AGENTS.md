# Search-engine changes

- Preserve restaurant search caches across search-engine changes. Do not clear them or increment the cache version unless the user explicitly requests a cache reset or the stored payload schema becomes incompatible.
- When OpenRouter is unavailable or out of credits, prefer a matching cached result and then the supplied city guide instead of returning an empty search.
- If a local server retains old search modules, restart only the server started for this task. Do not clear provider cooldowns simply to retry an exhausted quota.
- Never fill a result quota with invented restaurants, URLs, ratings, or allergy claims. Keep source-backed uncertain matches clearly labeled.
