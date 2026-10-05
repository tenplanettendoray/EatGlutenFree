import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTsModule } from './load-ts-module.mjs';
const { premiumReturn } = loadTsModule('app/lib/premium-return.ts');
test('billing returns to original search, maps account to home, and blocks external redirects', () => {
 const origin = 'https://app.test';
 assert.equal(premiumReturn('/search?location=Rome&allergies=Gluten', origin), '/search?location=Rome&allergies=Gluten');
 for (const value of ['/account', '/account?tab=plan', '/premium/billing', 'https://evil.test/', '//evil.test', null]) assert.equal(premiumReturn(value, origin), '/');
});
