import assert from "node:assert/strict";
import test from "node:test";
import { loadTsModule } from "./load-ts-module.mjs";

function accessFor(row, now) {
  const { getAccountAccess } = loadTsModule("app/lib/premium.ts", {
    "../../db": { getDb: () => ({ select: () => ({ from: () => ({ where: () => ({ limit: async () => [row] }) }) }) }) },
    "../../db/schema": { user: {} },
    "drizzle-orm": { eq: () => true },
  }, { Date: class extends Date { static now() { return now; } } });
  return getAccountAccess({ user: { id: "trial-test-account" } });
}

test("trial lasts exactly seven days with a reminder beginning on day five", async () => {
  const start = new Date("2026-09-01T12:00:00Z");
  const row = { role: "user", premiumPlan: null, trialStartedAt: start };
  const day = 86400000;
  assert.equal((await accessFor(row, +start + 5 * day - 1)).trialReminder, false);
  const reminder = await accessFor(row, +start + 5 * day);
  assert.equal(reminder.premium, true); assert.equal(reminder.trialReminder, true);
  assert.equal((await accessFor(row, +start + 7 * day - 1)).premium, true);
  const expired = await accessFor(row, +start + 7 * day);
  assert.equal(expired.premium, false); assert.equal(expired.trialEligible, false);
  assert.equal((await accessFor({ role: "user", premiumPlan: null }, +start)).trialEligible, true);
});

test("cancelled trials cannot resume and lifetime access is recognized", async () => {
  const start = new Date("2026-09-01T12:00:00Z");
  const cancelled = await accessFor({ role: "user", trialStartedAt: start, trialCancelledAt: start }, +start + 1000);
  assert.equal(cancelled.premium, false);
  assert.equal(cancelled.trialEligible, false);
  assert.equal(cancelled.trialReminder, false);
  const lifetime = await accessFor({ role: "user", premiumPlan: "lifetime", premiumPaymentReference: "paid-test", premiumActivatedAt: start, trialCancelledAt: start }, +start);
  assert.equal(lifetime.premium, true);
  assert.equal(lifetime.plan, "lifetime");
});

test("restaurant ratings require login, validate stars, and update rather than duplicate each account's vote", async () => {
  const rows = []; let signedIn = false;
  const columns = { userId: "userId", restaurantKey: "restaurantKey", stars: "stars" };
  const route = loadTsModule("app/api/restaurant-rating/route.ts", {
    "../../../db/schema": { restaurantRating: columns },
    "../../../db": { getDb: () => ({
      select: () => ({ from: () => ({ where: async predicate => rows.filter(predicate) }) }),
      delete: () => ({ where: async predicate => { for (let index = rows.length - 1; index >= 0; index--) if (predicate(rows[index])) rows.splice(index, 1); } }),
      insert: () => ({ values: value => ({ onConflictDoUpdate: async ({ target, set }) => {
        const previous = rows.find(row => target.every(column => row[column] === value[column]));
        if (previous) Object.assign(previous, set); else rows.push(value);
      } }) }),
    }) },
    "drizzle-orm": { eq: (column, value) => row => row[column] === value, and: (...predicates) => row => predicates.every(predicate => predicate(row)) },
    "../../lib/auth": { auth: { api: { getSession: async () => signedIn ? { user: { id: "test-user" } } : null } } },
    "next/server": { NextResponse: { json: (data, options) => ({ data, status: options?.status || 200 }) } },
  });
  const request = stars => ({ headers: new Headers(), nextUrl: new URL("https://app.test/api/restaurant-rating"), json: async () => ({ name: "Example", address: "1 Test Street, Paris", stars }) });
  assert.equal((await route.POST(request(4))).status, 401);
  signedIn = true;
  for (const invalid of [0, 6, 2.25, "5"]) assert.equal((await route.POST(request(invalid))).status, 400);
  assert.equal((await route.POST(request(4))).data.average, 4);
  const updated = await route.POST(request(2));
  assert.equal(rows.length, 1); assert.equal(updated.data.count, 1); assert.equal(updated.data.average, 2); assert.equal(updated.data.own, 2);
  assert.equal((await route.POST(request(3.5))).data.own, 3.5);
  assert.equal((await route.POST(request(0.5))).data.own, 0.5);
  rows.push({ userId: "another-user", restaurantKey: rows[0].restaurantKey, stars: 4 });
  const cleared = await route.POST(request(null));
  assert.equal(cleared.data.own, null); assert.equal(cleared.data.count, 1); assert.equal(cleared.data.average, 4);
});


test("auth return preserves search context and rejects external or looping destinations", () => {
  const { safeAuthReturn } = loadTsModule("app/lib/auth-return.ts");
  const origin = "https://app.test";
  assert.equal(safeAuthReturn("/search?location=Paris&allergies=Gluten#results", origin), "/search?location=Paris&allergies=Gluten#results");
  assert.equal(safeAuthReturn("https://app.test/premium?return=%2Fsearch", origin), "/premium?return=%2Fsearch");
  for (const raw of ["https://evil.test/", "//evil.test", "javascript:alert(1)", "/sign-up", "/onboarding", "/sign-in/a"]) assert.equal(safeAuthReturn(raw, origin), "/search");
});
