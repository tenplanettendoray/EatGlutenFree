import { cities, title as guideTitle } from "./data/gluten-free-city-guide.json";
import type { AiDiscoveredRestaurant } from "./ai-discovery";
import { sameRestaurantBrand } from "./restaurant-identity";

type Input = { location: string; food: string; allergies: string[] };
type FoodCategory = "B" | "C" | "D" | "N" | "P" | "S";
type AllergyCategory = "ML" | "PN" | "SF";
const clean = (value: string) => value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

export function guideCityKey(location: string) {
  const city = clean(location.split(",")[0]);
  const aliases: Record<string, string> = { "new york": "new york city", nyc: "new york city", "los angeles ca": "los angeles", la: "los angeles", roma: "rome", milano: "milan", lisboa: "lisbon", "mexico df": "mexico city", cdmx: "mexico city", "ciudad de mexico": "mexico city", "dubai uae": "dubai" };
  return aliases[city] || city;
}

export function guideMealCategory(food: string): FoodCategory | undefined {
  const value = clean(food);
  // Meal modifiers and combinations need AI because the guide ranks broad dishes only.
  if (/\b(vegan|vegetarian|veggie|halal|kosher)\b/.test(value)) return;
  const matches: FoodCategory[] = [];
  if (/\b(burgers?|hamburgers?|cheeseburgers?)\b/.test(value)) matches.push("B");
  if (/\b(chicken|fried chicken|wings?)\b/.test(value)) matches.push("C");
  if (/\b(pizzas?|pizzerias?)\b/.test(value)) matches.push("P");
  if (/\b(desserts?|patisseries?|pastr(?:y|ies)|cakes?|baker(?:y|ies)|cookies?|donuts?|doughnuts?|sweets?|ice cream|gelato)\b/.test(value)) matches.push("D");
  if (/\b(noodles?|pasta|ramen|pho)\b/.test(value)) matches.push("N");
  if (/\b(sushi|rolls?|sashimi)\b/.test(value)) matches.push("S");
  return matches.length === 1 ? matches[0] : undefined;
}

function guideAllergyCategory(allergies: string[]): AllergyCategory | undefined {
  if (allergies.length !== 1) return;
  const value = clean(allergies[0]);
  if (/^(milk|dairy|lactose)$/.test(value)) return "ML";
  if (/^(peanut|peanuts|groundnut|groundnuts)$/.test(value)) return "PN";
  if (/^(shellfish|crustacean|crustaceans|mollusc|molluscs|mollusk|mollusks)$/.test(value)) return "SF";
}

export function cityGuideRestaurants(input: Input): AiDiscoveredRestaurant[] {
  const city = cities.find(city => guideCityKey(city.city) === guideCityKey(input.location));
  if (!city || !input.allergies.length) return [];
  const glutenOnly = input.allergies.every(allergy => /^(gluten|gf|gluten free)$/.test(clean(allergy)));
  const foodCategory = glutenOnly ? guideMealCategory(input.food) : undefined;
  const allergyCategory = glutenOnly ? undefined : guideAllergyCategory(input.allergies);
  const category = foodCategory || allergyCategory;
  const listed = foodCategory ? city.categories[foodCategory] : allergyCategory ? city.allergyCategories?.[allergyCategory] : undefined;
  if (!category || !listed?.length) return [];
  return listed.map(entry => {
    // Keep existing PNY/Noglu votes connected to the new guide entry.
    const name = /^PNY\b/i.test(entry.name) ? "PNY" : entry.name === "No Glu" ? "Noglu" : entry.name;
    const pending = entry.label === "?";
    const maps = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${entry.name} ${city.city}`)}`;
    return {
      name, guideName: entry.name, guideRank: entry.rank, guideLabel: entry.label,
      cuisine: [foodCategory === "B" ? "Burgers" : foodCategory === "C" ? "Chicken" : foodCategory === "D" ? "Desserts / bakery" : foodCategory === "N" ? "Noodles / pasta" : foodCategory === "P" ? "Pizza" : foodCategory === "S" ? "Sushi / rolls" : `${input.allergies[0]}-aware`],
      website: "", websiteStatus: "missing" as const, menuSourceUrl: "", qualitySourceUrl: city.sources[0],
      sourceUrls: city.sources,
      evidenceSources: [{ title: guideTitle, url: "/gluten-free-city-guide.txt", quote: `${city.city} — ${entry.name}: ${pending ? "unconfirmed lead" : "reported gluten-free option"}. Original guide position ${entry.rank}; current branch and dish need confirmation.` }],
      evidenceSummary: pending ? "The supplied guide marks this as an unconfirmed lead. Confirm the current dish and allergy procedures with the restaurant." : allergyCategory ? `Listed by the supplied guide for ${input.allergies[0]} awareness. Confirm the current dish, branch and cross-contact procedures with staff.` : "Reported as a gluten-free option in the supplied city guide. Confirm the current dish, branch and cross-contact procedures with staff.",
      popularitySummary: "Editorial guide order; not a measured popularity or review score.",
      rankingReason: pending ? "Certified guide lead · current details need confirmation." : "Certified guide listing · confirm current preparation.",
      confidence: entry.label === "D" ? "strong" as const : ["A", "AM"].includes(entry.label) ? "medium" as const : "weak" as const,
      evidenceRank: entry.label === "D" ? 5 : ["A", "AM"].includes(entry.label) ? 4 : entry.label === "M" ? 3 : 1,
      popularityTier: Math.max(1, 6 - entry.rank),
      supportedAllergies: [...input.allergies], missingAllergies: [], allergenEvidence: [],
      locations: [{ label: city.city, address: input.location.split(",")[0].trim(), website: "", sourceUrl: maps }],
    };
  });
}

/** Guide records stay first; AI may enrich them, but may not duplicate them. */
export function mergeGuideRestaurants(listed: AiDiscoveredRestaurant[], discovered: AiDiscoveredRestaurant[], limit = 9) {
  const combined = listed.map(item => {
    const found = discovered.find(candidate => sameRestaurantBrand(candidate.name, item.name));
    if (!found) return item;
    return { ...item, ...found, name: item.name, guideName: item.guideName, guideRank: item.guideRank, guideLabel: item.guideLabel,
      supportedAllergies: item.supportedAllergies, missingAllergies: item.missingAllergies,
      evidenceSources: [...(item.evidenceSources || []), ...(found.evidenceSources || [])],
      sourceUrls: [...new Set([...(item.sourceUrls || []), ...(found.sourceUrls || [])])],
    };
  });
  for (const candidate of discovered) {
    if (combined.some(item => sameRestaurantBrand(item.name, candidate.name))) continue;
    combined.push(candidate);
  }
  return combined.slice(0, limit);
}
