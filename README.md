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

## Checks

```bash
npm run lint
npm run build
```

The app is built with Vinext for a Cloudflare-compatible runtime.
