import { eq } from "drizzle-orm";
import { getDb } from "../../db";
import { restaurantSearchCache } from "../../db/schema";

type CacheMode = "free" | "premium";

function normalized(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

export async function restaurantSearchCacheKey(input: {
  mode: CacheMode;
  location: string;
  latitude?: number;
  longitude?: number;
  food: string;
  allergies: string[];
}, version = 25) {
  const normalizedLocation = normalized(input.location);
  const source = JSON.stringify({
    version,
    mode: input.mode,
    location: normalizedLocation,
    // A typed city is the canonical search identity. Coordinates only identify
    // searches that genuinely have no location text, avoiding needless cache
    // misses from tiny globe/geocoder coordinate differences.
    latitude: !normalizedLocation && Number.isFinite(input.latitude) ? Number(input.latitude).toFixed(3) : "",
    longitude: !normalizedLocation && Number.isFinite(input.longitude) ? Number(input.longitude).toFixed(3) : "",
    food: normalized(input.food),
    allergies: input.allergies.map(normalized).filter(Boolean).sort(),
    // Preference changes explicitly invalidate the whole cache, so including
    // asynchronously loaded preference arrays here would only make identical
    // visible searches produce different cache entries.
  });
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(source));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function readRestaurantSearchCache<T>(cacheKey: string): Promise<T | null> {
  const row = await getDb().select().from(restaurantSearchCache).where(eq(restaurantSearchCache.cacheKey, cacheKey)).limit(1).then((rows) => rows[0]);
  if (!row) return null;
  try {
    return JSON.parse(row.payload) as T;
  } catch {
    await getDb().delete(restaurantSearchCache).where(eq(restaurantSearchCache.cacheKey, cacheKey));
    return null;
  }
}

export async function writeRestaurantSearchCache(cacheKey: string, mode: CacheMode, payload: unknown) {
  await getDb().insert(restaurantSearchCache).values({
    cacheKey,
    mode,
    payload: JSON.stringify(payload),
    createdAt: new Date(),
  }).onConflictDoUpdate({
    target: restaurantSearchCache.cacheKey,
    set: { mode, payload: JSON.stringify(payload), createdAt: new Date() },
  });
}

export async function invalidateRestaurantSearchCache() {
  await getDb().delete(restaurantSearchCache);
}
