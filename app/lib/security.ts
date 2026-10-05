import { env } from "cloudflare:workers";

export function securityDb() { return env.DB; }
export async function securityHash(value: string) {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret || secret.length < 32) throw new Error("A strong authentication secret is required.");
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return Array.from(new Uint8Array(signature), b => b.toString(16).padStart(2, "0")).join("");
}

// Cloudflare overwrites this header at the public edge. Never trust X-Forwarded-For.
export function clientNetwork(request: Request) {
  return request.headers.get("cf-connecting-ip") || "local-or-unknown";
}

export async function consumeLimit(key: string, max: number, windowSeconds: number) {
  const now = Math.floor(Date.now() / 1000);
  const row = await securityDb().prepare(`INSERT INTO security_rate_limit (key, count, expires_at) VALUES (?, 1, ?)
    ON CONFLICT(key) DO UPDATE SET count = CASE WHEN expires_at <= ? THEN 1 ELSE count + 1 END,
    expires_at = CASE WHEN expires_at <= ? THEN excluded.expires_at ELSE expires_at END
    RETURNING count, expires_at`).bind(key, now + windowSeconds, now, now).first<{ count: number; expires_at: number }>();
  if (!row) throw new Error("Rate limiter unavailable");
  return { allowed: row.count <= max, retryAfter: Math.max(1, row.expires_at - now) };
}

export function requestPolicy(path: string, method: string) {
  if (/^\/api\/auth\/(sign-in|sign-up|forget-password|request-password-reset|reset-password|change-password|set-password)/.test(path)) return { group: "authentication", max: 10, seconds: 900 };
  if (path === "/api/subscription" && method !== "GET") return { group: "subscription", max: 5, seconds: 3600 };
  if (path === "/api/account/set-password") return { group: "password", max: 5, seconds: 900 };
  if (path === "/api/contact" && method === "POST") return { group: "contact", max: 5, seconds: 3600 };
  if (/^\/api\/(restaurants|restaurant-research|restaurant-lookup|suggestions)$/.test(path)) return { group: "discovery", max: 20, seconds: 60 };
  if (path.startsWith("/api/admin")) return { group: "admin", max: 30, seconds: 60 };
  return { group: method === "GET" ? "reads" : "writes", max: method === "GET" ? 120 : 30, seconds: 60 };
}

export function validMutationOrigin(request: Request) {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return true;
  const origin = request.headers.get("origin");
  const expected = new Set([new URL(request.url).origin]);
  if (process.env.BETTER_AUTH_URL) expected.add(new URL(process.env.BETTER_AUTH_URL).origin);
  return Boolean(origin && expected.has(origin) && request.headers.get("sec-fetch-site") !== "cross-site");
}

export async function auditSecurity(userId: string | null, kind: string, score = 0, reasons: string[] = []) {
  await securityDb().prepare("INSERT INTO security_event (id, user_id, kind, score, reasons, created_at) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(crypto.randomUUID(), userId, kind, score, JSON.stringify(reasons), Date.now()).run();
}
