# Safe Serve

**CanIEatIt?** Safe Serve researches nearby restaurants against a diner’s food, occasion, and allergy filters. It uses public restaurant sources for free searches and optional AI providers for deeper research.

## Local development

Requires Node.js `>=22.13.0`.

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Authentication with Better Auth

Safe Serve uses Better Auth with a Cloudflare D1 database for email/password accounts, social sign-in, sessions, usernames, password changes, and sign-out. Generate a unique secret for each environment:

```dotenv
BETTER_AUTH_SECRET=replace_with_at_least_32_random_characters
BETTER_AUTH_URL=http://localhost:3000
```

Email/password registration works without another service. To enable a social button, add credentials from that provider:

```dotenv
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
APPLE_CLIENT_ID=
APPLE_CLIENT_SECRET=
MICROSOFT_CLIENT_ID=
MICROSOFT_CLIENT_SECRET=
```

Use `http://localhost:3000/api/auth/callback/google`, `/apple`, or `/microsoft` as the local OAuth callback URL. Set `BETTER_AUTH_URL` to the real HTTPS origin when deploying and keep every secret server-side.

After editing the auth schema, create a database migration with `npm run db:generate`. The generated `drizzle/` migration is packaged for the D1 binding declared in `.openai/hosting.json`.

`npm run dev` automatically applies pending migrations to the local D1 database before starting the site.

## Restaurant search configuration

Both search modes use the server-only `OPENROUTER_API_KEY` from `.env.local` (or the hosting environment). `GOOGLE_API_KEY` remains a legacy alias for an OpenRouter key; it is not a direct Google API integration. Tavily and Foursquare are not used by the active restaurant search.

Public web sources supply restaurant candidates and concise context to the AI. The default primary model is `google/gemma-4-26b-a4b-it:free`, with `liquid/lfm-2.5-2.6b:free` as the fallback. Override them with `OPENROUTER_DISCOVERY_MODEL` and `OPENROUTER_FALLBACK_MODEL`. A model-specific upstream limit permits fallback; an account quota stops further AI requests. Requests and retries are bounded, and free provider capacity is not unlimited.

Restaurants need evidence for the requested city and dish. Official website buttons require fetched business identity checks; allergy claims require actual website excerpts. Unverified addresses, ratings and websites are omitted. Confidence describes the evidence, not a guarantee of safety. Cross-contamination mentions are shown separately, and gluten-free evidence does not imply wheat-free accommodation. If public retrieval is unavailable, the fallback AI can propose research leads, which require independent website verification. If AI is unavailable, verified websites and explicit local directory listings can provide results with a visible fallback notice.

The supplied 2026 city guide contains 299 category entries in 20 cities. Gluten-only burger, pizza and dessert searches include matching guide picks; AI supplies distinct additions. Other cities, meals and allergy combinations use AI discovery. The guide's reported and unconfirmed labels are preserved; they do not certify safety. Import a revised list with `node scripts/import-city-guide.mjs /path/to/guide.txt`.

All results sort first by community reactions (30 points per heart and 8 per average star), then documented allergy evidence, guide inclusion/editorial order, public popularity, and original AI order. Votes can lift AI discoveries above guide picks, but never change verified allergy claims or remove cross-contact warnings. Saved recommendations remain visible even outside the normal result window. Successful results expire after 24 hours; degraded fallback results expire after 15 minutes. Identical simultaneous searches share discovery work, and cached results receive live community totals.

After every search-engine change, increment the cache version in `app/lib/search-cache.ts` and run `npm run search:cache:clear` after validation. The command deletes only local saved search results and reports the remaining row count. It preserves user accounts, search history, ratings, and subscriptions.

Run an opt-in live evaluation (uses provider quota):

```bash
node scripts/evaluate-restaurant-search.mjs "New York City" burger
node scripts/evaluate-restaurant-search.mjs "Paris" pizza
```

Reports under `outputs/search-evaluation/` contain public place details, confidence and source excerpts, never API keys. A failed quality check exits nonzero; the script does not modify production caches.

AI customer support has its own model configuration (OPENAI_SUPPORT_MODEL and OPENROUTER_SUPPORT_MODEL), using the existing server-side API keys. Chat keeps its compact 400-token response cap, bounded history, one provider fallback, and five-minute cooldown for quota/auth failures. Its common reviewed answers use no model tokens.

## AI customer support

The global Customer support button opens a clearly labeled AI allergy assistant. It answers allergy and app questions using bounded conversation history and reviewed notes from [NHS food allergy guidance](https://www.nhs.uk/conditions/food-allergy/), [FARE cross-contact guidance](https://www.foodallergy.org/resources/avoiding-cross-contact), and [NHS anaphylaxis guidance](https://www.nhs.uk/conditions/anaphylaxis/). Replies link only to the approved sources they cite. Review the notes in `app/lib/support-knowledge.ts` when guidance changes.

Common general questions about cooking, cross-contact and restaurant preparation use reviewed reference answers without model tokens, labeled “Allergy guide.” Other questions use the AI. Active severe-symptom messages receive immediate emergency guidance without waiting for a model. The assistant does not diagnose, prescribe, certify meals, or impersonate human support. Chat is kept in component memory, not local storage or the app database; for AI answers, recent messages are sent to the configured provider. OpenAI requests disable response storage. Other provider retention policies still apply.

The endpoint bounds message size and recent history, rejects other browser origins, and rate-limits ordinary chat to eight messages per minute per client and sixty per process. These are in-memory limits, not a distributed billing cap; configure an edge/WAF rate limit when scaling to multiple instances.

## Premium and admin access

Premium plan activations are stored on the signed-in user record in D1. The current checkout is a local entitlement preview until a payment provider is connected.

Grant admin access by adding an account email or Better Auth user ID to `.env.local`:

```dotenv
ADMIN_EMAILS=owner@example.com
ADMIN_USER_IDS=
```

Multiple values can be separated with commas. Admins can open `/admin` to view account entitlements, aggregate search activity, recent search context, and suggestion/avoid counts. Passwords, session tokens, and IP addresses are never returned by the admin endpoint.

For deployment, apply the D1 migrations remotely and configure the same admin variables in the hosting environment.

## Checks

```bash
npm run lint
npm run typecheck
node --test --test-isolation=none tests/ai-quality.test.mjs
npm run build
```

The app is built with Vinext for a Cloudflare-compatible runtime.

Restaurant searches request up to nine distinct restaurants. Sparse searches may return fewer than three when more candidates cannot be supported; names and safety claims are never invented to meet a count.
