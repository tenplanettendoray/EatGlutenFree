import { rankWithCommunityPopularity } from "./community-ranking";
import { restaurantBrandKey, sameRestaurantBrand } from "./restaurant-identity";

export type PublicPreference = { kind: "suggest" | "avoid"; name: string; count: number };
type RankedRestaurant = { guideRank?: number; evidenceRank?: number; id: string; name: string; discoveryRank?: number; suggestionCount?: number; avoidCount?: number; missingAllergies?: string[]; matchQuality?: number; popularityTier?: number; rating?: number | null; communityRating?: number | null };

export function preferenceContextKey(context: { location: string; food: string; allergies: string[]; mode: string }) {
  const clean = (value: string) => value.trim().toLowerCase().replace(/\s+/g, " ");
  return JSON.stringify([clean(context.location), clean(context.food), context.allergies.map(clean).sort(), context.mode]);
}

export function preferenceMatchesContext(stored: { locationScope: string; foodScope: string; allergyScope: string }, current: { locationScope: string; foodScope: string; allergyScope: string }) {
  const overlaps = (a: string, b: string) => Boolean(a && b && (a === b || a.includes(b) || b.includes(a)));
  return overlaps(stored.locationScope, current.locationScope)
    && stored.allergyScope.split("|").some(allergy => allergy && current.allergyScope.split("|").includes(allergy))
    && (!stored.foodScope || overlaps(stored.foodScope, current.foodScope));
}

function brand(value: string) {
  return restaurantBrandKey(value);
}

export function preferenceMatchesRestaurant(name: string, preference: string) {
  return sameRestaurantBrand(name, preference);
}

export function communityVoteScore(suggestions: number, avoids: number) {
  // One vote can move a result past its equally suitable neighbour (10 points).
  return Math.min(Math.max(0, suggestions), 20) * 15 - Math.min(Math.max(0, avoids), 20) * 20;
}

/** Reapply authoritative totals against the original discovery rank, not the last voted order. */
export function applyCommunityPreferences<T extends RankedRestaurant>(restaurants: T[], preferences: PublicPreference[], createSuggestion?: (name: string, index: number) => T): T[] {
  const candidates = [...restaurants];
  for (const preference of preferences) {
    if (!createSuggestion || preference.kind !== "suggest" || preference.count <= 0 || candidates.some(item => preferenceMatchesRestaurant(item.name, preference.name))) continue;
    const suggestions = preferences.filter(item => item.kind === "suggest" && preferenceMatchesRestaurant(item.name, preference.name)).reduce((count, item) => count + item.count, 0);
    const avoids = preferences.filter(item => item.kind === "avoid" && preferenceMatchesRestaurant(item.name, preference.name)).reduce((count, item) => count + item.count, 0);
    if (suggestions > avoids) candidates.push(createSuggestion(preference.name, candidates.length));
  }
  const ranked = candidates.map((restaurant, index) => {
    const matching = preferences.filter(item => preferenceMatchesRestaurant(restaurant.name, item.name));
    const suggestionCount = matching.filter(item => item.kind === "suggest").reduce((count, item) => count + item.count, 0);
    const avoidCount = matching.filter(item => item.kind === "avoid").reduce((count, item) => count + item.count, 0);
    const discoveryRank = restaurant.discoveryRank ?? index;
    return {
      restaurant: { ...restaurant, discoveryRank, suggestionCount, avoidCount },
      originalIndex: discoveryRank,
      communityScore: communityVoteScore(suggestionCount, avoidCount),
      missingAllergyCount: restaurant.missingAllergies?.length || 0,
      matchQuality: restaurant.matchQuality || 0,
      popularityTier: restaurant.popularityTier || 0,
      evidenceRank: restaurant.evidenceRank || 0,
      guideRank: restaurant.guideRank,
      heartCount: suggestionCount,
      avoidCount,
      starRating: restaurant.communityRating ?? restaurant.rating ?? 3,
      isCommunitySuggestion: restaurant.id.startsWith("community-"),
    };
  }).filter(item => !item.isCommunitySuggestion || item.restaurant.suggestionCount > 0 || item.restaurant.avoidCount > 0);
  return rankWithCommunityPopularity(ranked).map(item => item.restaurant);
}

export function createCommunityRestaurant(name: string, index: number, context: { location: string; food: string; allergies: string[]; mode: "free" | "premium" }) {
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${name} ${context.location}`)}`;
  return {
    id: `community-${encodeURIComponent(brand(name))}`, discoveryRank: index, matchQuality: 0, popularityTier: 0, communityRating: null as number | null, name,
    cuisine: context.food ? [context.food, "Community suggestion"] : ["Community suggestion"],
    address: context.location, distanceKm: null, website: "", websiteStatus: "missing" as const, checkedAt: undefined,
    dietary: {}, latitude: null, longitude: null, source: context.mode === "free" ? "free" as const : "ai" as const,
    sourceUrl: mapsUrl, menuSourceUrl: "", qualitySourceUrl: mapsUrl,
    evidenceSummary: "Community suggestion. Allergy accommodation has not been independently confirmed; check ingredients and cross-contact with staff.",
    popularitySummary: "Recommended by the community for this search context.",
    rankingReason: "Raised by community recommendations. Confirm menu availability and allergy accommodation directly.",
    rating: null, reviewCount: null, suggestionCount: 0, avoidCount: 0, evidenceTier: "partial" as const,
    supportedAllergies: [] as string[], missingAllergies: [...context.allergies], allergenEvidence: [],
    locations: [{ label: context.location, address: context.location, website: "", sourceUrl: mapsUrl }],
  };
}

/** Saved recommendations remain visible even when they rank after the normal window. */
export function visibleRestaurantResults<T extends { suggestionCount?: number; guideRank?: number }>(items: T[], limit = 12) {
  return items.filter((item, index) => index < limit || Boolean(item.guideRank) || (item.suggestionCount || 0) > 0);
}
