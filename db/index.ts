import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

// Schema is provisioned by the packaged D1 migrations, never by requests.
export function getDb() {
  if (!env.DB) throw new Error("The Cloudflare D1 binding DB is unavailable.");
  return drizzle(env.DB, { schema });
}
