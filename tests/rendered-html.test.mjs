import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("builds the Gluten FreEat homepage and catchphrase", async () => {
  const [layout, homepage] = await Promise.all([
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(layout, /Gluten FreEat — Can I Eat It\?/i);
  assert.match(homepage, /aria-label="Return to the Gluten FreEat start page"/i);
  assert.match(homepage, /Can I Eat It\?/i);
  assert.match(homepage, /AccountControls/i);
  assert.doesNotMatch(homepage, /ClearPlate/i);
});

test("keeps the Better Auth account experience wired to public routes", async () => {
  const [accountPage, authUi, authServer, authRoute, packageJson] = await Promise.all([
    readFile(new URL("../app/account/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/auth-ui.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/auth.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/auth/[...all]/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);
  assert.match(accountPage, /Gluten FreEat/i);
  assert.match(authUi, /authClient\.signUp\.email/);
  assert.match(authUi, /authClient\.signIn\.email/);
  assert.match(authUi, /provider: "google"/);
  assert.match(authUi, /provider: "apple"/);
  assert.match(authUi, /provider: "microsoft"/);
  assert.match(authUi, /authClient\.changePassword/);
  assert.match(authUi, /authClient\.signOut/);
  assert.match(authServer, /from "better-auth"/);
  assert.match(authServer, /drizzleAdapter/);
  assert.match(authRoute, /toNextJsHandler/);
  assert.match(packageJson, /"better-auth"/);
  assert.doesNotMatch(packageJson, /legacy-auth-provider/);
});
