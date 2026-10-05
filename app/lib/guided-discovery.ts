import { discoverRestaurantsWithOpenRouter } from "./openrouter-discovery";
import { cityGuideRestaurants, mergeGuideRestaurants } from "./city-guide";
import { reviewedCandidates } from "./restaurant-evidence";
import { verifyAndRankRestaurants } from "./restaurant-verification";
import { sameRestaurantBrand } from "./restaurant-identity";

export async function discoverRestaurants(input: Parameters<typeof discoverRestaurantsWithOpenRouter>[0]) {
  const guide = cityGuideRestaurants(input);
  if (!guide.length) return discoverRestaurantsWithOpenRouter(input);
  const known = reviewedCandidates(input);
  const leads = guide.map(item => {
    const candidate = known.find(candidate => sameRestaurantBrand(candidate.n, item.name));
    // This exact menu URL is supplied in the guide's dated correction notes.
    const corrected = item.name === "Noglu" && /^paris\b/i.test(input.location) && /burger/i.test(input.food)
      ? "https://noglu.fr/products/burger-classique" : "";
    return { ...item, website: corrected || candidate?.w || "" };
  });
  const [checked, additional] = await Promise.allSettled([
    verifyAndRankRestaurants(leads, input),
    discoverRestaurantsWithOpenRouter({ ...input, excludedRestaurants: guide.map(item => item.name) }),
  ]);
  const enriched = checked.status === "fulfilled" ? checked.value.filter(item => item.websiteStatus === "verified") : [];
  const ai = additional.status === "fulfilled" ? additional.value : undefined;
  const restaurants = mergeGuideRestaurants(guide, [...enriched, ...(ai?.restaurants || [])]);
  return {
    locationLabel: input.location, restaurants, status: "used" as const,
    provider: ai?.restaurants.length ? `City guide + ${ai.provider || "AI"}` : "City guide",
    model: ai?.status === "used" ? ai.model : "editorial-guide-2026",
    searchWarning: ai?.status === "used" ? undefined : "Showing the city-guide picks. Additional live results are temporarily unavailable.",
  };
}
