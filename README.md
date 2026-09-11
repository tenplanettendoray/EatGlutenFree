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

## AI search configuration

The free and premium search providers read their server-side API keys from `.env.local`. Keep that file private.

Restaurant searches use the original AI discovery flow: OpenRouter for free search and OpenAI for premium search, with the existing cached results, fallback candidates and community preference ranking. The map-catalog ranking engine has been reverted. Restaurant suggestions and linked websites still need direct confirmation with the venue.

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
