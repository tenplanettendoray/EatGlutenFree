import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTsModule } from './load-ts-module.mjs';
test('contact validates messages, limits repeat submissions, and restricts inbox to admins', async () => {
 let session = null, admin = false; const rows = [];
 const route = loadTsModule('app/api/contact/route.ts', {
  '../../../db/schema': { supportMessage: {} },
  '../../../db': { getDb: () => ({ select: () => ({ from: () => ({ where: () => ({ limit: async () => rows }), orderBy: () => ({ limit: async () => rows }) }) }), insert: () => ({ values: async value => rows.push(value) }) }) },
  'drizzle-orm': { and: () => true, eq: () => true, gt: () => true, desc: () => true },
  '../../lib/auth': { auth: { api: { getSession: async () => session } } },
  '../../lib/premium': { getAccountAccess: async () => ({ admin }) },
  'next/server': { NextResponse: { json: (data, options) => ({ data, status: options?.status || 200 }) } },
 }, { crypto: { randomUUID: () => 'message-id' } });
 const request = message => ({ headers: new Headers(), json: async () => ({ message }) });
 assert.equal((await route.POST(request('Question?'))).status, 401);
 assert.equal((await route.GET(request())).status, 403);
 session = { user: { id: 'user', email: 'user@example.test' } };
 assert.equal((await route.POST(request('a'))).status, 400);
 assert.equal((await route.POST(request('How does the trial work?'))).status, 201);
 assert.equal(rows[0].email, session.user.email);
 assert.equal((await route.POST(request('Another question?'))).status, 429);
 admin = true;
 assert.equal((await route.GET(request())).data.messages.length, 1);
});
