import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// Deliberately local-only: user records and search history are separate tables.
const root = fileURLToPath(new URL("../", import.meta.url));
const cli = fileURLToPath(new URL("../node_modules/wrangler/bin/wrangler.js", import.meta.url));
const result = spawnSync(process.execPath, [cli, "d1", "execute", "site-creator-d1", "--local", "--config", "wrangler.auth.jsonc", "--command",
  "DELETE FROM restaurant_search_cache; SELECT COUNT(*) AS remaining_search_cache_rows FROM restaurant_search_cache;"], {
  cwd: root,
  env: { ...process.env, WRANGLER_LOG_PATH: ".wrangler/wrangler.log" },
  stdio: "inherit",
});
if (result.error) console.error(result.error.message);
process.exitCode = result.status ?? 1;
