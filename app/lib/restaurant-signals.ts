import { sql } from "drizzle-orm";
import { getDb } from "../../db";
import { restaurantSignal } from "../../db/schema";

export type WeightedPreferenceSignal = {
  name: string;
  suggestionWeight: number;
  avoidWeight: number;
  clickWeight: number;
  searchWeight: number;
  totalWeight: number;
  locationScope: string;
  allergyScope: string;
  foodScope: string;
};

type SignalContext = {
  location: string;
  allergies: string[];
  food: string;
};

type SignalIncrement = {
  name: string;
  locationScope: string;
  allergyScope: string;
  foodScope: string;
  suggestionWeight?: number;
  avoidWeight?: number;
  clickWeight?: number;
  searchWeight?: number;
};

export function normalizedRestaurantName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\b(restaurants?|nyc|new york)\b/g, "").replace(/\s+/g, " ").trim();
}

export function normalizedSignalScope(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 120);
}

export function allergySignalScope(allergies: string[]) {
  return allergies
    .map((allergy) => normalizedRestaurantName(allergy))
    .filter(Boolean)
    .sort()
    .join("|")
    .slice(0, 240);
}

export function signalScopeOverlaps(stored: string, current: string, mode: "location" | "allergy" | "food") {
  if (!stored || !current) return false;
  if (mode === "allergy") {
    const currentAllergies = new Set(current.split("|").filter(Boolean));
    return stored.split("|").filter(Boolean).some((allergy) => currentAllergies.has(allergy));
  }
  return stored === current || stored.includes(current) || current.includes(stored);
}

export async function getPublicRestaurantSignals(context: SignalContext) {
  const db = getDb();
  const location = normalizedSignalScope(context.location);
  const allergies = allergySignalScope(context.allergies);
  const food = normalizedSignalScope(context.food);
  const rows = await db.select().from(restaurantSignal).limit(10000);

  const contextualSignals = rows.filter((row) => {
    if (!signalScopeOverlaps(row.locationScope, location, "location")) return false;
    if (!signalScopeOverlaps(row.allergyScope, allergies, "allergy")) return false;
    if (row.foodScope && food && !signalScopeOverlaps(row.foodScope, food, "food")) return false;
    if (row.foodScope && !food) return false;
    return true;
  });

  const byName = new Map<string, { name: string; score: number }>();
  for (const row of contextualSignals) {
    const score = Math.max(0, row.suggestionWeight + row.clickWeight + row.searchWeight - row.avoidWeight);
    const existing = byName.get(row.normalizedName);
    if (existing) existing.score += score;
    else byName.set(row.normalizedName, { name: row.name, score });
  }

  return {
    preferenceSignals: contextualSignals.map((row) => ({
      name: row.name,
      suggestionWeight: row.suggestionWeight,
      avoidWeight: row.avoidWeight,
      clickWeight: row.clickWeight,
      searchWeight: row.searchWeight,
      totalWeight: row.suggestionWeight + row.clickWeight + row.searchWeight - row.avoidWeight,
      locationScope: row.locationScope,
      allergyScope: row.allergyScope,
      foodScope: row.foodScope,
    })).sort((a, b) => b.totalWeight - a.totalWeight || b.clickWeight - a.clickWeight || a.name.localeCompare(b.name)),
    suggestedRestaurants: [...byName.values()]
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
      .flatMap((item) => Array.from({ length: Math.min(item.score, 5) }, () => item.name))
      .slice(0, 24),
    avoidedRestaurants: contextualSignals
      .filter((row) => row.avoidWeight > row.suggestionWeight + row.clickWeight + row.searchWeight)
      .sort((a, b) => b.avoidWeight - a.avoidWeight || a.name.localeCompare(b.name))
      .map((row) => row.name)
      .filter((name, index, list) => list.indexOf(name) === index)
      .slice(0, 12),
  };
}

export async function incrementRestaurantSignals(updates: SignalIncrement[]) {
  const db = getDb();
  const now = new Date();
  for (const update of updates) {
    const normalizedName = normalizedRestaurantName(update.name);
    if (!normalizedName) continue;
      await db.insert(restaurantSignal).values({
        id: crypto.randomUUID(),
        name: update.name,
        normalizedName,
        locationScope: update.locationScope,
        allergyScope: update.allergyScope,
        foodScope: update.foodScope,
        suggestionWeight: Math.max(0, update.suggestionWeight || 0),
        avoidWeight: Math.max(0, update.avoidWeight || 0),
        clickWeight: Math.max(0, update.clickWeight || 0),
        searchWeight: Math.max(0, update.searchWeight || 0),
        createdAt: now,
        updatedAt: now,
      }).onConflictDoUpdate({
        target: [restaurantSignal.normalizedName, restaurantSignal.locationScope, restaurantSignal.allergyScope, restaurantSignal.foodScope],
        set: {
        name: update.name,
        suggestionWeight: sql`max(0, ${restaurantSignal.suggestionWeight} + ${update.suggestionWeight || 0})`,
        avoidWeight: sql`max(0, ${restaurantSignal.avoidWeight} + ${update.avoidWeight || 0})`,
        clickWeight: sql`max(0, ${restaurantSignal.clickWeight} + ${update.clickWeight || 0})`,
        searchWeight: sql`max(0, ${restaurantSignal.searchWeight} + ${update.searchWeight || 0})`,
        updatedAt: now,
        },
      });
  }
}
