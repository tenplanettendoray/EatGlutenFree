import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { loadTsModule } from "./load-ts-module.mjs";

function fixture() {
  const db = new DatabaseSync(":memory:");
  const journal = JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf8"));
  for (const entry of journal.entries) db.exec(readFileSync(`drizzle/${entry.tag}.sql`, "utf8"));
  const binding = {
    prepare(sql) {
      let args = [];
      const query = { bind(...values) { args = values; return query; },
        async first() { return db.prepare(sql).get(...args); },
        async all() { return { results: db.prepare(sql).all(...args) }; },
        async run() { return db.prepare(sql).run(...args); } };
      return query;
    },
    async batch(statements) {
      db.exec("BEGIN");
      try { const result = []; for (const statement of statements) result.push(await statement.run()); db.exec("COMMIT"); return result; }
      catch (error) { db.exec("ROLLBACK"); throw error; }
    },
  };
  const mocks = { "cloudflare:workers": { env: { DB: binding } }, "next/server": {} };
  const globals = { process: { env: { BETTER_AUTH_SECRET: "unit-test-secret-at-least-thirty-two-characters" } } };
  return { db, security: loadTsModule("app/lib/security.ts", mocks, globals), claim: loadTsModule("app/lib/trial-claim.ts", mocks, globals).claimTrial };
}

test("persistent limiter rejects excess parallel requests and resets expired windows", async () => {
  const { db, security } = fixture();
  try {
    const results = await Promise.all(Array.from({ length: 30 }, () => security.consumeLimit("login", 10, 60)));
    assert.equal(results.filter(r => r.allowed).length, 10);
    db.exec("UPDATE security_rate_limit SET expires_at = 0");
    assert.equal((await security.consumeLimit("login", 10, 60)).allowed, true);
    assert.equal(db.prepare("SELECT count FROM security_rate_limit").get().count, 1);
  } finally { db.close(); }
});

test("origin checks reject missing and hostile origins but permit same-origin actions", () => {
  const { db, security } = fixture();
  try {
    for (const origin of [undefined, "https://attacker.test", "null"]) assert.equal(security.validMutationOrigin(new Request("https://app.test/api/subscription", { method: "POST", headers: origin ? { origin } : {} })), false);
    assert.equal(security.validMutationOrigin(new Request("https://app.test/api/subscription", { method: "POST", headers: { origin: "https://app.test" } })), true);
    assert.equal(security.validMutationOrigin(new Request("http://localhost:3001/api/restaurant-rating", { method: "POST", headers: { origin: "http://localhost:3001" } })), true);
    assert.equal(security.clientNetwork(new Request("https://app.test", { headers: { "x-forwarded-for": "spoof" } })), "local-or-unknown");
  } finally { db.close(); }
});

test("risk signals require strong combinations; shared network alone does not block", () => {
  const { trialRisk } = loadTsModule("app/lib/trial-risk.ts");
  const current = { device: "a", network: "n", browser: "b", screen: "s", timezone: "t" };
  assert.equal(trialRisk(current, { ...current, device: "z", browser: "x", screen: "x", timezone: "x" }).blocked, false);
  assert.equal(trialRisk(current, { ...current, device: "z" }).blocked, true);
  assert.equal(trialRisk(current, { device: "a", network: "", browser: "", screen: "", timezone: "" }).score, 100);
});

test("trial cookie forgery is rejected and a reused device cannot activate another account", async () => {
  const { db, security, claim } = fixture();
  try {
    for (const id of ["one", "two"]) db.prepare("INSERT INTO user (id, name, email, created_at, updated_at) VALUES (?, ?, ?, 0, 0)").run(id, id, `${id}@test.invalid`);
    const id = crypto.randomUUID();
    const signature = await security.securityHash(`device:${id}`);
    const request = cookie => ({ headers: new Headers({ "cf-connecting-ip": "203.0.113.1", "user-agent": "test-browser" }), cookies: { get: () => ({ value: cookie }) } });
    assert.equal((await claim(request(`${id}.fake`), "one", {})).status, 403);
    assert.equal(await claim(request(`${id}.${signature}`), "one", { screen: "1920x1080", timezone: "Europe/Paris" }), null);
    assert.equal((await claim(request(`${id}.${signature}`), "two", {})).status, 403);
    assert.equal(db.prepare("SELECT trial_started_at FROM user WHERE id = 'two'").get().trial_started_at, null);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM trial_claim").get().n, 1);
    assert.equal(db.prepare("SELECT score FROM security_event WHERE kind = 'trial_blocked'").get().score, 100);
  } finally { db.close(); }
});

test("paid entitlement requires proof and expiry; admin role is not a paid plan", async () => {
  const start = new Date();
  let row = { role: "admin", premiumPlan: "lifetime", premiumActivatedAt: start };
  const { getAccountAccess } = loadTsModule("app/lib/premium.ts", {
    "../../db": { getDb: () => ({ select: () => ({ from: () => ({ where: () => ({ limit: async () => [row] }) }) }) }) },
    "../../db/schema": { user: {} }, "drizzle-orm": { eq: () => true },
  });
  const session = { user: { id: "test" } };
  assert.equal((await getAccountAccess(session)).premium, false);
  row = { ...row, premiumPaymentReference: "receipt" };
  assert.equal((await getAccountAccess(session)).premium, true);
  row = { ...row, premiumPlan: "monthly", premiumExpiresAt: new Date(Date.now() - 1000) };
  assert.equal((await getAccountAccess(session)).premium, false);
  row.premiumExpiresAt = new Date(Date.now() + 60000);
  assert.equal((await getAccountAccess(session)).premium, true);
});

test("configured admin emails from env can open admin without paid access", async () => {
  const row = { role: "user", premiumPlan: null, premiumActivatedAt: null, premiumPaymentReference: null, premiumExpiresAt: null };
  const { getAccountAccess, isConfiguredAdminEmail } = loadTsModule("app/lib/premium.ts", {
    "../../db": { getDb: () => ({ select: () => ({ from: () => ({ where: () => ({ limit: async () => [row] }) }) }) }) },
    "../../db/schema": { user: {} }, "drizzle-orm": { eq: () => true },
  }, { process: { env: { ADMIN_EMAILS: "owner@test.invalid, second@test.invalid\nthird@test.invalid" } } });
  const access = await getAccountAccess({ user: { id: "admin-id", email: "Second@Test.Invalid", emailVerified: false } });
  assert.equal(access.admin, true);
  assert.equal(access.premium, false);
  assert.equal(isConfiguredAdminEmail("third@test.invalid"), true);
});
