# Application security controls

All API requests pass through `middleware.ts` in the Vinext app. Deploy the complete build, including middleware and migration `0010_security.sql`. The local database migration has been applied; remote databases require the same migration before deployment. A stable `BETTER_AUTH_SECRET` of at least 32 characters is required.

## Access and billing

Admin pages and APIs require a server-validated session and an admin role or configured admin identity. Email-based admin configuration additionally requires a verified email. Client request fields cannot set roles or paid entitlements.

Premium requires an active seven-day trial or a stored paid entitlement with a payment reference and activation date. Monthly and yearly access also require a future expiry date. Admin and search-allowlist status do not grant Premium. Old placeholder plan records without payment evidence no longer grant access. Checkout is still a preview: no payment processor or payment webhook is connected. A future integration must verify the provider's webhook signature, account, amount, currency, event idempotency, and paid status before writing entitlement fields. Never activate plans from a browser success redirect.

## Request limits

Counters use atomic D1 upserts, shared across processes. Limits apply per network and, outside auth endpoints, per signed-in account. Authentication: 10 attempts per 15 minutes; password setup: 5 per 15 minutes; subscription changes and contact submissions: 5 per hour; discovery: 20 per minute; admin API: 30 per minute; other reads: 120 per minute; other writes: 30 per minute. Free searches additionally have a server-side ceiling of four attempts per UTC day, including any suggestion bonus. Failed search attempts count toward that ceiling.

Mutation requests require the configured application origin. Bodies are limited to 32 KiB, including streamed requests without Content-Length. Rate-limit and security-storage failures fail closed. Responses include anti-framing, MIME-sniffing, referrer, and basic CSP restrictions. The CSP is a baseline, not a complete script allowlist.

Production must remain behind Cloudflare, which overwrites `CF-Connecting-IP`. An alternate proxy must supply its own trusted client-IP handling before deployment; `X-Forwarded-For` is intentionally ignored. Local requests without a trusted address share a network bucket.

## Repeat-trial risk

Trial starts compare keyed hashes of a signed HttpOnly device cookie, network address, browser user agent, screen dimensions and time zone. Raw IPs and screen values are not stored in the trial-claim table. Wi-Fi names, MAC addresses and precise geographic location are not collected.

A matching device contributes 100 points; network 55; browser 15; screen 15; time zone 10. A score of 90 blocks the trial and records an admin-visible event. Matching network alone cannot block a trial. User, device and composite fingerprint uniqueness constraints protect concurrent claims; the claim and activation commit in a D1 transaction. Claims intentionally survive account deletion to prevent resetting eligibility.

This is abuse deterrence, not proof of identity. Shared devices may cause false positives; changed devices, networks, cookies or spoofed browser signals may evade detection. Blocked users receive a support link. No automatic account ban is applied. A manual review can inspect security events; an automated override workflow is not implemented.

The security history displays the latest 100 trial and admin-revocation events. Storage retention and scheduled cleanup should be configured for the deployment's requirements. Edge-level DDoS protection and bot challenges remain separate from these application limits.
