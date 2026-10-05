import { eq } from "drizzle-orm";
import { getDb } from "../../db";
import { restaurantSearchCache } from "../../db/schema";

type CacheMode = "free" | "premium";

function normalized(value: string) {
  return value.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").replace(/\s+/g, " ").trim();
}

export async function restaurantSearchCacheKey(input: {
  mode: CacheMode;
  location: string;
  latitude?: number;
  longitude?: number;
  food: string;
  allergies: string[];
  suggestedRestaurants?: string[];
}, version = 53) {
  const normalizedLocation = normalized(input.location);
  const source = JSON.stringify({
    version,
    // Discovery is public and identical for both plans; entitlements and
    // community votes are applied independently after reading this cache.
    location: normalizedLocation,
    // Coordinates keep nearby-city searches distinct when the browser supplies them.
    latitude: Number.isFinite(input.latitude) ? Number(input.latitude).toFixed(3) : "",
    longitude: Number.isFinite(input.longitude) ? Number(input.longitude).toFixed(3) : "",
    food: normalized(input.food),
    allergies: input.allergies.map(normalized).filter(Boolean).sort(),
    // New recommendation names change candidate discovery; vote totals remain live.
    suggestions: [...new Set((input.suggestedRestaurants || []).map(normalized))].sort(),
  });
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(source));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function readRestaurantSearchCache<T>(cacheKey: string, options: { allowStale?: boolean } = {}): Promise<T | null> {
  const row = await getDb().select().from(restaurantSearchCache).where(eq(restaurantSearchCache.cacheKey, cacheKey)).limit(1).then((rows) => rows[0]);
  if (!row) return null;
  // Menu and branch information changes; never reuse it indefinitely.
  if (!options.allowStale && Date.now() - new Date(row.createdAt).getTime() > 24 * 60 * 60 * 1000) return null;
  try {
    const payload = JSON.parse(row.payload);
    // Retry the AI sooner for a successful but degraded public-web result.
    if (!options.allowStale && payload.searchWarning && Date.now() - new Date(row.createdAt).getTime() > 15 * 60 * 1000) return null;
    return payload as T;
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
