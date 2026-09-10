import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

let analyticsSchemaReady: Promise<void> | null = null;

export function getDb() {
  // Avoid failing during the worker's startup validation, which runs before
  // runtime bindings are attached. Database operations still validate the
  // binding when a request actually uses them.
  return drizzle(env.DB, { schema });
}

export async function ensureRestaurantSignalSchema() {
  if (!env.DB) {
    throw new Error("The Cloudflare D1 binding DB is unavailable.");
  }
  if (!analyticsSchemaReady) {
    analyticsSchemaReady = (async () => {
      await env.DB.exec(`
        CREATE TABLE IF NOT EXISTS restaurant_signal (
          id text PRIMARY KEY NOT NULL,
          name text NOT NULL,
          normalized_name text NOT NULL,
          location_scope text DEFAULT '' NOT NULL,
          allergy_scope text DEFAULT '' NOT NULL,
          food_scope text DEFAULT '' NOT NULL,
          suggestion_weight integer DEFAULT 0 NOT NULL,
          avoid_weight integer DEFAULT 0 NOT NULL,
          click_weight integer DEFAULT 0 NOT NULL,
          search_weight integer DEFAULT 0 NOT NULL,
          created_at integer NOT NULL,
          updated_at integer NOT NULL
        );
      `);
      await env.DB.exec("CREATE UNIQUE INDEX IF NOT EXISTS restaurant_signal_scope_unique ON restaurant_signal (normalized_name, location_scope, allergy_scope, food_scope);");
      await env.DB.exec("CREATE INDEX IF NOT EXISTS restaurant_signal_scope_idx ON restaurant_signal (location_scope, allergy_scope, food_scope);");
      await env.DB.exec("CREATE INDEX IF NOT EXISTS restaurant_signal_weight_idx ON restaurant_signal (suggestion_weight, avoid_weight, click_weight, search_weight);");
    })().catch((error) => {
      analyticsSchemaReady = null;
      throw error;
    });
  }
  await analyticsSchemaReady;
}
