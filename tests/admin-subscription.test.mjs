import assert from "node:assert/strict";
import test from "node:test";
import { loadTsModule } from "./load-ts-module.mjs";

test("admin cancellation enforces authentication and targets only the chosen user", async () => {
  let signedIn = false, admin = false, mutation;
  const route = loadTsModule("app/api/admin/users/route.ts", {
    "../../../lib/security": { auditSecurity: async () => {} },
    "../../../../db/schema": { user: { id: "id" } },
    "../../../../db": { getDb: () => ({
      select: () => ({ from: () => ({ where: () => ({ limit: async () => [{ id: "target" }] }) }) }),
      update: () => ({ set: values => ({ where: async predicate => { mutation = { values, predicate }; } }) }),
    }) },
    "drizzle-orm": { eq: (column, value) => ({ column, value }), desc: value => value },
    "../../../lib/auth": { auth: { api: { getSession: async () => signedIn ? { user: { id: "admin" } } : null } } },
    "../../../lib/premium": { getAccountAccess: async () => ({ admin }) },
    "next/server": { NextResponse: { json: (data, options) => ({ data, status: options?.status || 200 }) } },
  });
  const request = userId => ({ headers: new Headers(), json: async () => ({ userId }) });
  assert.equal((await route.DELETE(request("target"))).status, 401);
  signedIn = true;
  assert.equal((await route.DELETE(request("target"))).status, 403);
  assert.equal(mutation, undefined);
  admin = true;
  assert.equal((await route.DELETE(request(42))).status, 400);
  assert.equal((await route.DELETE(request("target"))).status, 200);
  assert.equal(mutation.predicate.value, "target");
  assert.equal(mutation.values.premiumPlan, null);
  assert.ok(mutation.values.trialCancelledAt instanceof Date);
  assert.equal(mutation.values.role, undefined);
});

test("admin premium switch grants and removes only premium entitlement", async () => {
  let mutation;
  const route = loadTsModule("app/api/admin/users/route.ts", {
    "../../../lib/security": { auditSecurity: async () => {} },
    "../../../../db/schema": { user: { id: "id" } },
    "../../../../db": { getDb: () => ({
      select: () => ({ from: () => ({ where: () => ({ limit: async () => [{ id: "target" }] }) }) }),
      update: () => ({ set: values => ({ where: async predicate => { mutation = { values, predicate }; } }) }),
    }) },
    "drizzle-orm": { eq: (column, value) => ({ column, value }), desc: value => value },
    "../../../lib/auth": { auth: { api: { getSession: async () => ({ user: { id: "admin" } }) } } },
    "../../../lib/premium": { getAccountAccess: async () => ({ admin: true }) },
    "next/server": { NextResponse: { json: (data, options) => ({ data, status: options?.status || 200 }) } },
  });
  const request = premium => ({ headers: new Headers(), json: async () => ({ userId: "target", premium }) });
  const on = await route.PATCH(request(true));
  assert.equal(on.status, 200);
  assert.equal(mutation.predicate.value, "target");
  assert.equal(mutation.values.premiumPlan, "lifetime");
  assert.match(mutation.values.premiumPaymentReference, /^admin-grant-/);
  assert.equal(mutation.values.role, undefined);
  const off = await route.PATCH(request(false));
  assert.equal(off.status, 200);
  assert.equal(mutation.values.premiumPlan, null);
  assert.equal(mutation.values.premiumPaymentReference, null);
  assert.equal(mutation.values.role, undefined);
});
