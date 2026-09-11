import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const journal = JSON.parse(read("drizzle/meta/_journal.json"));

test("every migration is registered and provisions a clean publication database", () => {
  const files = readdirSync(new URL("../drizzle/", import.meta.url)).filter((name) => name.endsWith(".sql")).sort();
  assert.deepEqual(journal.entries.map((entry) => `${entry.tag}.sql`).sort(), files);
  const db = new DatabaseSync(":memory:");
  try {
    db.exec("PRAGMA foreign_keys = ON");
    for (const entry of journal.entries) db.exec(read(`drizzle/${entry.tag}.sql`));
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((row) => row.name);
    for (const name of ["user", "session", "account", "verification", "restaurant_preference", "restaurant_signal", "restaurant_search_cache", "user_search"]) assert.ok(tables.includes(name), name);
    const columns = db.prepare('PRAGMA table_info("user")').all().map((row) => row.name);
    for (const name of ["role", "premium_plan", "premium_activated_at", "premium_updated_at"]) assert.ok(columns.includes(name), name);
    assert.equal(db.prepare("PRAGMA integrity_check").get().integrity_check, "ok");
    assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
    // Cache writes replace one search, rather than duplicating it.
    db.prepare("INSERT INTO restaurant_search_cache VALUES (?, ?, ?, ?)").run("test", "free", "{}", 0);
    assert.throws(() => db.prepare("INSERT INTO restaurant_search_cache VALUES (?, ?, ?, ?)").run("test", "free", "{}", 0), /UNIQUE/);
  } finally { db.close(); }
});

test("build packages the exact DB binding and complete migration journal", () => {
  const source = JSON.parse(read(".openai/hosting.json"));
  assert.equal(source.d1, "DB");
  assert.ok(source.project_id.startsWith("appgprj_"));
  assert.deepEqual(JSON.parse(read("dist/.openai/hosting.json")), source);
  assert.deepEqual(JSON.parse(read("dist/.openai/drizzle/meta/_journal.json")), journal);
  for (const entry of journal.entries) assert.equal(read(`dist/.openai/drizzle/${entry.tag}.sql`), read(`drizzle/${entry.tag}.sql`));
});
