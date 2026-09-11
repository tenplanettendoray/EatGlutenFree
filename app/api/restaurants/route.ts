import { NextRequest, NextResponse } from "next/server";
import { discoverRestaurants, type AiDiscoveredRestaurant } from "@/app/lib/ai-discovery";
import { discoverRestaurantsWithOpenRouter } from "@/app/lib/openrouter-discovery";
import { getAccountAccess } from "@/app/lib/premium";
import { rankWithCommunityPopularity } from "@/app/lib/community-ranking";
import { readRestaurantSearchCache, restaurantSearchCacheKey, writeRestaurantSearchCache } from "@/app/lib/search-cache";
import { recordUserSearch } from "@/app/lib/user-searches";
import { getDb } from "../../../db";
import { restaurantPreference } from "../../../db/schema";
import { auth } from "../../lib/auth";

const FREE_DAILY_LIMIT = 3;
const FREE_SUGGESTION_BONUS = 1;
const FREE_SEARCH_COOKIE = "safeserve_free_searches";
const FREE_SUGGESTION_COOKIE = "safeserve_suggestion_bonus";

function normalizedId(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
}

function cityOnlyLocation(value: string) {
  const cleaned = value.trim().replace(/\s+/g, " ");
  const parts = cleaned.split(",").map((part) => part.trim()).filter(Boolean);
  if (parts.length < 2) return cleaned;
  const first = normalizedScope(parts[0]);
  const countryFirst = /^(united states(?: of america)?|usa|us|canada|france|united kingdom|uk|england|australia|germany|italy|spain|china|japan|india)$/.test(first);
  return countryFirst ? parts[1] : parts[0];
}

function normalizedScope(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 120);
}

function allergyScope(allergies: string[]) {
  return allergies.map(normalizedScope).filter(Boolean).sort().join("|").slice(0, 240);
}

function brandScope(value: string) {
  const scope = normalizedScope(value);
  if (scope.includes("friedman")) return "friedmans";
  if (scope.includes("bill") && scope.includes("burger")) return "bills-bar-burger";
  return scope
    .replace(/\b(restaurants?|nyc|new york|city|bar|and|burger|burgers|cafe|diner)\b/g, " ")
    .replace(/\bs\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function requestedGlutenAllergies(allergies: string[]) {
  return allergies.filter((allergy) => {
    const scope = normalizedScope(allergy);
    return scope === "gluten" || scope === "wheat" || scope === "gf" || scope.includes("gluten free");
  });
}

function scopeOverlaps(stored: string, current: string, mode: "location" | "allergy" | "food") {
  if (!stored || !current) return false;
  if (mode === "allergy") {
    const currentAllergies = new Set(current.split("|").filter(Boolean));
    return stored.split("|").filter(Boolean).some((allergy) => currentAllergies.has(allergy));
  }
  return stored === current || stored.includes(current) || current.includes(stored);
}

function dailyUsage(request: NextRequest) {
  const today = new Date().toISOString().slice(0, 10);
  const [savedDate, savedCount] = (request.cookies.get(FREE_SEARCH_COOKIE)?.value || "").split(":");
  const count = savedDate === today ? Math.max(0, Number.parseInt(savedCount || "0", 10) || 0) : 0;
  return { today, count };
}

function dailySuggestionBonus(request: NextRequest, today: string) {
  const [savedDate, savedClaimed] = (request.cookies.get(FREE_SUGGESTION_COOKIE)?.value || "").split(":");
  return savedDate === today && savedClaimed === "1" ? FREE_SUGGESTION_BONUS : 0;
}

function setDailyUsage(response: NextResponse, date: string, count: number) {
  response.cookies.set(FREE_SEARCH_COOKIE, `${date}:${count}`, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 48,
  });
  return response;
}

type SearchInput = {
  location: string;
  latitude?: number;
  longitude?: number;
  food: string;
  occasion: string;
  priceRange: string;
  allergies: string[];
  suggestedRestaurants: string[];
  avoidedRestaurants: string[];
  preferenceSignals: WeightedPreferenceSignal[];
};

type WeightedPreferenceSignal = {
  name: string;
  suggestionWeight: number;
  avoidWeight: number;
  locationScope: string;
  allergyScope: string;
  foodScope: string;
};

function publicPreferenceData(input: SearchInput) {
  const location = normalizedScope(input.location);
  const allergies = allergyScope(input.allergies);
  const food = normalizedScope(input.food);
  return getDb().select().from(restaurantPreference).limit(5000).then((rows) => {
    const signals = new Map<string, WeightedPreferenceSignal>();
    for (const row of rows) {
      if (!scopeOverlaps(row.locationScope, location, "location")) continue;
      if (!scopeOverlaps(row.allergyScope, allergies, "allergy")) continue;
      if (row.foodScope && food && !scopeOverlaps(row.foodScope, food, "food")) continue;
      if (row.foodScope && !food) continue;

      const signalKey = [row.normalizedName, row.locationScope, row.allergyScope, row.foodScope].join("|");
      const signal = signals.get(signalKey) || {
        name: row.name,
        suggestionWeight: 0,
        avoidWeight: 0,
        locationScope: row.locationScope,
        allergyScope: row.allergyScope,
        foodScope: row.foodScope,
      };
      if (row.kind === "suggest") signal.suggestionWeight += 1;
      else signal.avoidWeight += 1;
      signals.set(signalKey, signal);
    }
    return {
      preferenceSignals: [...signals.values()].sort((a, b) =>
        (b.suggestionWeight + b.avoidWeight) - (a.suggestionWeight + a.avoidWeight)
        || a.name.localeCompare(b.name)),
    };
  }).catch(() => ({ preferenceSignals: [] as WeightedPreferenceSignal[] }));
}

async function withPublicPreferences(input: SearchInput): Promise<SearchInput> {
  const { preferenceSignals } = await publicPreferenceData(input);
  return {
    ...input,
    preferenceSignals,
  };
}

function restoredStrongCandidates(input: SearchInput): AiDiscoveredRestaurant[] {
  const location = normalizedScope(input.location);
  const food = normalizedScope(input.food);
  const glutenAllergies = requestedGlutenAllergies(input.allergies);
  const wantsNewYork = /\b(new york|nyc|manhattan|brooklyn)\b/.test(location);
  const wantsParis = /\b(paris)\b/.test(location);
  const wantsBurger = !food || /\b(burger|burgers|hamburger|cheeseburger)\b/.test(food);
  if ((!wantsNewYork && !wantsParis) || !wantsBurger || !glutenAllergies.length) return [];

  const supportedGlutenName = glutenAllergies[0] || "Gluten";
  const missingAllergies = input.allergies.filter((allergy) =>
    !glutenAllergies.some((glutenAllergy) => normalizedScope(glutenAllergy) === normalizedScope(allergy)),
  );

  const newYorkCandidates: AiDiscoveredRestaurant[] = [
    {
      name: "Friedman's",
      cuisine: ["Burger", "American", "Gluten-free friendly"],
      website: "https://www.friedmansrestaurant.com/",
      menuSourceUrl: "https://www.friedmansrestaurant.com/menu/all-day/",
      qualitySourceUrl: "https://www.friedmansrestaurant.com/",
      evidenceSummary: "Restaurant-owned menus list gluten-free bread for burgers and many gluten-free dishes; confirm ingredients and cross-contact directly with the restaurant.",
      popularitySummary: "Established NYC restaurant group widely associated with gluten-free dining.",
      rankingReason: "Leading NYC match for its long-running gluten-free focus, broad local presence, and established burger offering.",
      supportedAllergies: [supportedGlutenName],
      missingAllergies,
      locations: [
        {
          label: "Multiple NYC locations",
          address: "New York, NY",
          website: "https://www.friedmansrestaurant.com/",
          sourceUrl: "https://www.friedmansrestaurant.com/locations/",
        },
      ],
    },
    {
      name: "Bill's Bar & Burger",
      cuisine: ["Burger", "American"],
      website: "https://www.billsbarandburger.com/",
      menuSourceUrl: "https://www.billsbarandburger.com/faqs/",
      qualitySourceUrl: "https://www.billsbarandburger.com/",
      evidenceSummary: "The restaurant-owned FAQ says most menu items can be made gluten-free on request with a gluten-free bun; confirm ingredients and cross-contact directly with the restaurant.",
      popularitySummary: "Known NYC burger restaurant with established public recognition.",
      rankingReason: "Well-known NYC burger restaurant with an explicit gluten-free bun accommodation, ranked below stronger dedicated allergy programs.",
      supportedAllergies: [supportedGlutenName],
      missingAllergies,
      locations: [
        {
          label: "New York location",
          address: "New York, NY",
          website: "https://www.billsbarandburger.com/",
          sourceUrl: "https://www.billsbarandburger.com/locations/",
        },
      ],
    },
    {
      name: "5 Napkin Burger",
      cuisine: ["Burger", "American", "Gluten-free option"],
      website: "https://www.5napkinburger.com/",
      menuSourceUrl: "https://www.5napkinburger.com/menus/",
      qualitySourceUrl: "https://www.5napkinburger.com/locations/",
      evidenceSummary: "5 Napkin Burger is currently recognized for offering gluten-free buns at its NYC burger restaurants; confirm the bun, fryer, ingredients, and cross-contact protocol with staff.",
      popularitySummary: "Long-running, high-profile New York burger restaurant with active Hell's Kitchen and Upper West Side locations.",
      rankingReason: "A prominent local burger specialist with a longstanding gluten-free bun option and stronger city recognition than generic chains.",
      supportedAllergies: [supportedGlutenName],
      missingAllergies,
      locations: [
        {
          label: "Hell's Kitchen",
          address: "630 9th Avenue, New York, NY 10036",
          website: "https://www.5napkinburger.com/location/hells-kitchen/",
          sourceUrl: "https://www.5napkinburger.com/locations/",
        },
        {
          label: "Upper West Side",
          address: "2315 Broadway, New York, NY 10024",
          website: "https://www.5napkinburger.com/location/upper-west-side/",
          sourceUrl: "https://www.5napkinburger.com/locations/",
        },
      ],
    },
    {
      name: "Bareburger",
      cuisine: ["Burger", "American", "Gluten-free option"],
      website: "https://bareburger.com/",
      menuSourceUrl: "https://bareburger.com/menu/",
      qualitySourceUrl: "https://bareburger.com/locations/",
      evidenceSummary: "Bareburger's current menu offers a gluten-free bun across its build-your-own beef burgers; confirm cross-contact procedures directly at the selected branch.",
      popularitySummary: "Long-running New York burger group with numerous active city locations.",
      rankingReason: "Strong citywide burger relevance, multiple locations, and an explicit gluten-free bun on the current menu.",
      supportedAllergies: [supportedGlutenName],
      missingAllergies,
      locations: [
        {
          label: "Hell's Kitchen",
          address: "366 West 46th Street, New York, NY 10036",
          website: "https://bareburger.com/locations/hells-kitchen/",
          sourceUrl: "https://bareburger.com/locations/hells-kitchen/",
        },
        {
          label: "Upper West Side",
          address: "2233 Broadway, New York, NY 10024",
          website: "https://bareburger.com/locations/",
          sourceUrl: "https://bareburger.com/locations/",
        },
      ],
    },
    {
      name: "Holy Burger",
      cuisine: ["Burger", "American", "Gluten-free option"],
      website: "https://www.holyburger.nyc/",
      menuSourceUrl: "https://order.holyburger.nyc/order/holy-burger-upper-west",
      qualitySourceUrl: "https://www.holyburger.nyc/home",
      evidenceSummary: "Holy Burger's current ordering menu has a dedicated gluten-free section with burgers made using gluten-free ingredients and rolls, while noting that the facility also processes wheat.",
      popularitySummary: "Multi-location New York burger brand with dedicated gluten-free menu choices.",
      rankingReason: "A food-specific local brand with explicit gluten-free burger builds rather than a bunless substitution.",
      supportedAllergies: [supportedGlutenName],
      missingAllergies,
      locations: [
        {
          label: "Upper West Side",
          address: "23 West 100th Street, New York, NY",
          website: "https://order.holyburger.nyc/order/holy-burger-upper-west",
          sourceUrl: "https://order.holyburger.nyc/order/holy-burger-upper-west",
        },
      ],
    },
    {
      name: "Schnipper's",
      cuisine: ["Burger", "American", "Gluten-free option"],
      website: "https://www.schnippers.com/",
      menuSourceUrl: "https://www.schnippers.com/menu/gluten-free/",
      qualitySourceUrl: "https://www.schnippers.com/",
      evidenceSummary: "Schnipper's publishes a gluten-free menu stating that its beef, turkey, and Impossible burgers can be ordered on a gluten-free bun, with an explicit cross-contact warning.",
      popularitySummary: "Established New York fast-casual burger restaurant with multiple Midtown locations.",
      rankingReason: "Strong local recognition and a restaurant-published gluten-free burger menu, with transparent cross-contact limitations.",
      supportedAllergies: [supportedGlutenName],
      missingAllergies,
      locations: [
        {
          label: "Midtown",
          address: "New York, NY",
          website: "https://www.schnippers.com/locations/",
          sourceUrl: "https://www.schnippers.com/locations/",
        },
      ],
    },
  ];

  const parisCandidates: AiDiscoveredRestaurant[] = [
    {
      name: "PNY",
      cuisine: ["Burger", "American", "Gluten-free"],
      website: "https://www.pnyburger.com/",
      menuSourceUrl: "https://www.glutenlibre.co/restaurant/pny-paris",
      qualitySourceUrl: "https://www.pnyburger.com/",
      evidenceSummary: "The Gluten Libre community directory currently lists PNY Oberkampf as a 100% gluten-free restaurant specializing in burgers; confirm the current protocol directly before ordering.",
      popularitySummary: "Established Paris burger group with many locations and strong local recognition.",
      rankingReason: "Strongest blend of Paris burger prominence and a branch-specific gluten-free signal.",
      supportedAllergies: [supportedGlutenName],
      missingAllergies,
      locations: [
        {
          label: "Oberkampf",
          address: "96 Rue Oberkampf, 75011 Paris",
          website: "https://restaurants.pnyburger.com/burger-paris-11-oberkampf/",
          sourceUrl: "https://www.pnyburger.com/address",
        },
      ],
    },
    {
      name: "NoGlu",
      cuisine: ["Burger", "Gluten-free", "Bakery"],
      website: "https://noglu.fr/",
      menuSourceUrl: "https://noglu.fr/collections/les-plats",
      qualitySourceUrl: "https://noglu.fr/",
      evidenceSummary: "NoGlu's restaurant-owned menu identifies the offering as 100% gluten-free and lists both classic and vegetarian burgers.",
      popularitySummary: "Long-established dedicated gluten-free name in Paris with multiple locations.",
      rankingReason: "Dedicated gluten-free operation with an explicit burger offering and strong Paris recognition.",
      supportedAllergies: [supportedGlutenName],
      missingAllergies,
      locations: [
        {
          label: "Basfroi",
          address: "15 Rue Basfroi, 75011 Paris",
          website: "https://noglu.fr/",
          sourceUrl: "https://noglu.fr/collections/les-plats",
        },
        {
          label: "Grenelle",
          address: "69 Rue de Grenelle, 75007 Paris",
          website: "https://noglu.fr/",
          sourceUrl: "https://noglu.fr/collections/les-plats",
        },
      ],
    },
    {
      name: "Loulou Friendly Diner",
      cuisine: ["Burger", "Australian", "Gluten-free"],
      website: "https://www.louloufriendlydiner.com/",
      menuSourceUrl: "https://www.louloufriendlydiner.com/menu",
      qualitySourceUrl: "https://www.louloufriendlydiner.com/",
      evidenceSummary: "Loulou's current restaurant site lists burgers among a menu with extensive gluten-free choices, while the Gluten Libre directory identifies gluten-free burgers and dedicated handling; confirm the current burger bun and protocol directly.",
      popularitySummary: "Established and highly visible Saint-Germain restaurant with substantial community recognition for gluten-free dining.",
      rankingReason: "Strong combination of Paris popularity, burger availability, and a serious gluten-free program.",
      supportedAllergies: [supportedGlutenName],
      missingAllergies,
      locations: [
        {
          label: "Saint-Germain",
          address: "90 Boulevard Saint-Germain, 75005 Paris",
          website: "https://www.louloufriendlydiner.com/",
          sourceUrl: "https://www.glutenlibre.co/restaurant/loulou-paris",
        },
      ],
    },
    {
      name: "Theory",
      cuisine: ["Burger", "Vegan", "Gluten-free option"],
      website: "https://theory-restaurant.fr/",
      menuSourceUrl: "https://theory-restaurant.fr/menu-paris",
      qualitySourceUrl: "https://theory-restaurant.fr/",
      evidenceSummary: "Theory's restaurant-owned Paris menu explicitly offers its burgers with a gluten-free option; confirm preparation and cross-contact directly.",
      popularitySummary: "Established Paris plant-based burger specialist with a focused menu.",
      rankingReason: "Food-relevant local specialist with an explicit gluten-free burger option on its current menu.",
      supportedAllergies: [supportedGlutenName],
      missingAllergies,
      locations: [
        {
          label: "Paris",
          address: "Paris, France",
          website: "https://theory-restaurant.fr/",
          sourceUrl: "https://theory-restaurant.fr/menu-paris",
        },
      ],
    },
    {
      name: "B&F Burger",
      cuisine: ["Burger", "American", "Gluten-free option"],
      website: "https://www.burger-fries.com/",
      menuSourceUrl: "https://www.burger-fries.com/la-carte",
      qualitySourceUrl: "https://www.burger-fries.com/",
      evidenceSummary: "B&F's current restaurant menu states that a gluten-free version is available for its fresh burgers; confirm preparation and cross-contact directly.",
      popularitySummary: "Paris burger specialist with active Left Bank and Grands Boulevards locations.",
      rankingReason: "Dedicated burger restaurant with an explicit gluten-free version on its own menu and multiple central Paris branches.",
      supportedAllergies: [supportedGlutenName],
      missingAllergies,
      locations: [
        {
          label: "Saint-Germain",
          address: "95 Boulevard Saint-Germain, 75006 Paris",
          website: "https://www.burger-fries.com/",
          sourceUrl: "https://www.burger-fries.com/la-carte",
        },
        {
          label: "Bonne-Nouvelle",
          address: "1 Boulevard de Bonne-Nouvelle, 75002 Paris",
          website: "https://www.burger-fries.com/",
          sourceUrl: "https://www.burger-fries.com/la-carte",
        },
      ],
    },
    {
      name: "Hard Rock Cafe Paris",
      cuisine: ["Burger", "American", "Gluten-free option"],
      website: "https://cafe.hardrock.com/paris/",
      menuSourceUrl: "https://cafe.hardrock.com/files/5282/Paris_Menu_FRE.pdf",
      qualitySourceUrl: "https://cafe.hardrock.com/paris/",
      evidenceSummary: "Hard Rock Cafe Paris publishes burger choices marked as available gluten-free and directs guests with allergies to inform their server.",
      popularitySummary: "Widely recognized international restaurant with a longstanding central Paris location.",
      rankingReason: "High recognition and a restaurant-published Paris menu that explicitly marks gluten-free-available burgers.",
      supportedAllergies: [supportedGlutenName],
      missingAllergies,
      locations: [
        {
          label: "Grands Boulevards",
          address: "14 Boulevard Montmartre, 75009 Paris",
          website: "https://cafe.hardrock.com/paris/",
          sourceUrl: "https://cafe.hardrock.com/paris/",
        },
      ],
    },
  ];

  const candidates = wantsParis ? parisCandidates : newYorkCandidates;
  const benchmarkOrder = wantsParis
    ? ["pny", "noglu", "loulou friendly", "theory", "b f", "hard rock paris"]
    : ["friedmans", "bareburger", "5 napkin", "bills-bar-burger", "schnipper", "holy"];
  candidates.sort((a, b) => {
    const aIndex = benchmarkOrder.findIndex((name) => brandScope(a.name).includes(name));
    const bIndex = benchmarkOrder.findIndex((name) => brandScope(b.name).includes(name));
    return (aIndex < 0 ? benchmarkOrder.length : aIndex) - (bIndex < 0 ? benchmarkOrder.length : bIndex);
  });

  return candidates.filter((candidate) => {
    const candidateScope = brandScope(candidate.name);
    return !input.avoidedRestaurants.some((avoided) => {
      const avoidedScope = brandScope(avoided);
      return avoidedScope && (candidateScope.includes(avoidedScope) || avoidedScope.includes(candidateScope));
    });
  });
}

function isIneligibleGenericChain(input: SearchInput, restaurant: { name: string }) {
  const location = normalizedScope(input.location);
  const food = normalizedScope(input.food);
  const brand = brandScope(restaurant.name);
  // Never revive known discontinued brands from an older AI/cache response.
  // The active-business rule in the prompt prevents these in new searches;
  // this guard also cleans results saved by older versions of the engine.
  if (["by chloe"].some((closedBrand) => brand === closedBrand || brand.startsWith(`${closedBrand} `))) return true;
  if (!/\b(burger|burgers|hamburger|cheeseburger)\b/.test(food) || !requestedGlutenAllergies(input.allergies).length) return false;
  const disallowedByLocation = /\bparis\b/.test(location)
    ? ["mcdonald", "mcdonalds", "burger king", "quick", "five guys", "kfc"]
    : /\blondon\b/.test(location)
      ? ["five guys", "black bear"]
      : [];
  return disallowedByLocation.some((chain) => brand.includes(chain));
}

function filterAllergyEligibleRestaurants(input: SearchInput, restaurants: AiDiscoveredRestaurant[]) {
  const withoutGenericChains = restaurants.filter((restaurant) => !isIneligibleGenericChain(input, restaurant));
  if (!input.allergies.length) return withoutGenericChains;
  const fullySupported = withoutGenericChains.filter((restaurant) => restaurant.missingAllergies.length === 0);
  if (fullySupported.length >= 5) return fullySupported;
  const partial = withoutGenericChains.filter((restaurant) => restaurant.missingAllergies.length > 0);
  return [...fullySupported, ...partial];
}

function fillWithFallbackCandidates(restaurants: AiDiscoveredRestaurant[], candidates: AiDiscoveredRestaurant[]) {
  if (!candidates.length) return restaurants;
  const seen = new Set<string>();
  const merged: AiDiscoveredRestaurant[] = [];
  // AI-ranked restaurants remain first. Independently researched candidates
  // only fill missing slots when the model returns fewer than five; their
  // names are never sent to either model.
  for (const restaurant of [...restaurants, ...candidates]) {
    const key = brandScope(restaurant.name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    merged.push(restaurant);
  }
  return merged.slice(0, 10);
}

function resultPayload(restaurants: AiDiscoveredRestaurant[], source: "free" | "ai") {
  return restaurants.map((restaurant, index) => ({
    id: `${source}-${index + 1}-${normalizedId(restaurant.name)}`,
    name: restaurant.name,
    cuisine: restaurant.cuisine,
    address: restaurant.locations[0].address,
    distanceKm: null,
    website: restaurant.website,
    dietary: {},
    latitude: null,
    longitude: null,
    source,
    sourceUrl: restaurant.menuSourceUrl,
    menuSourceUrl: restaurant.menuSourceUrl,
    qualitySourceUrl: restaurant.qualitySourceUrl,
    evidenceSummary: restaurant.evidenceSummary,
    popularitySummary: restaurant.popularitySummary,
    rankingReason: restaurant.rankingReason,
    rating: null,
    reviewCount: null,
    suggestionCount: 0,
    avoidCount: 0,
    evidenceTier: restaurant.missingAllergies.length ? "partial" as const : "ai" as const,
    supportedAllergies: restaurant.supportedAllergies,
    missingAllergies: restaurant.missingAllergies,
    locations: restaurant.locations,
  }));
}

async function runAiDiscovery(input: SearchInput, requestedMode: "free" | "premium") {
  const restoredCandidates = restoredStrongCandidates(input);
  const discoveryInput = {
    location: input.location,
    latitude: undefined,
    longitude: undefined,
    food: input.food,
    occasion: input.occasion,
    priceRange: input.priceRange,
    allergies: input.allergies,
  };
  let discovery = requestedMode === "free"
    ? await discoverRestaurantsWithOpenRouter(discoveryInput)
    : await discoverRestaurants(discoveryInput);
  let resultSource: "free" | "ai" = requestedMode === "free" ? "free" : "ai";
  let premiumFallback = false;
  let usedBackupSearch = false;
  if (requestedMode === "premium" && discovery.status !== "used") {
    const fallbackDiscovery = await discoverRestaurantsWithOpenRouter(discoveryInput);
    usedBackupSearch = true;
    if (fallbackDiscovery.status === "used") {
      discovery = fallbackDiscovery;
      resultSource = "ai";
      premiumFallback = true;
    } else {
      discovery = fallbackDiscovery;
    }
  }
  if (discovery.status !== "used") {
    if (restoredCandidates.length) {
      return {
        location: input.location,
        restaurants: resultPayload(restoredCandidates, resultSource),
        mode: requestedMode,
        agentQuery: [input.location, input.food, ...input.allergies].filter(Boolean).join(" · "),
        premiumFallback,
      };
    }
    const label = usedBackupSearch ? "Backup restaurant search" : requestedMode === "free" ? "Free restaurant search" : "Premium restaurant search";
    const reason = discovery.status === "quota" ? "has reached its current API limit" : discovery.status === "skipped" ? "is not configured" : "is temporarily unavailable";
    throw new Error(`${label} ${reason}.`);
  }
  const aiRestaurants = filterAllergyEligibleRestaurants(input, discovery.restaurants);
  const restaurants = aiRestaurants.length >= 5
    ? aiRestaurants
    : filterAllergyEligibleRestaurants(input, fillWithFallbackCandidates(aiRestaurants, restoredCandidates));
  return {
    location: discovery.locationLabel || input.location,
    restaurants: resultPayload(restaurants, resultSource),
    mode: requestedMode,
    agentQuery: [input.location, input.food, ...input.allergies].filter(Boolean).join(" · "),
    premiumFallback,
  };
}

type PublicDiscoveryPayload = Awaited<ReturnType<typeof runAiDiscovery>>;

function preferenceMatchesRestaurant(restaurantName: string, preferenceName: string) {
  const restaurant = brandScope(restaurantName);
  const preference = brandScope(preferenceName);
  return Boolean(restaurant && preference && (
    restaurant === preference
    || restaurant.includes(preference)
    || preference.includes(restaurant)
  ));
}

/** Apply community votes after discovery so they never enter the AI prompt. */
function applyWebsitePreferenceRanking(input: SearchInput, payload: PublicDiscoveryPayload): PublicDiscoveryPayload {
  const communitySuggestions = input.preferenceSignals
    .filter((signal) => signal.suggestionWeight > 0 && signal.suggestionWeight > signal.avoidWeight)
    .filter((signal) => !payload.restaurants.some((restaurant) => preferenceMatchesRestaurant(restaurant.name, signal.name)))
    .map((signal, index) => {
      const searchQuery = encodeURIComponent(`${signal.name} ${input.location}`);
      const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${searchQuery}`;
      return {
        id: `community-${index + 1}-${normalizedId(signal.name)}`,
        name: signal.name,
        cuisine: input.food ? [input.food, "Community suggestion"] : ["Community suggestion"],
        address: input.location,
        distanceKm: null,
        website: mapsUrl,
        dietary: {},
        latitude: null,
        longitude: null,
        source: payload.mode === "free" ? "free" as const : "ai" as const,
        sourceUrl: mapsUrl,
        menuSourceUrl: mapsUrl,
        qualitySourceUrl: mapsUrl,
        evidenceSummary: "Added from community suggestions for this location and allergy context. Allergy evidence has not been independently confirmed.",
        popularitySummary: `${signal.suggestionWeight} community ${signal.suggestionWeight === 1 ? "suggestion" : "suggestions"} for this search context.`,
        rankingReason: "Added from community suggestions and placed within the top three. Confirm menu availability, ingredients, and cross-contact directly.",
        rating: null,
        reviewCount: null,
        suggestionCount: signal.suggestionWeight,
        avoidCount: signal.avoidWeight,
        evidenceTier: "partial" as const,
        supportedAllergies: [],
        missingAllergies: [...input.allergies],
        locations: [{ label: input.location, address: input.location, website: mapsUrl, sourceUrl: mapsUrl }],
      };
    });

  const ranked = [...payload.restaurants, ...communitySuggestions].map((restaurant, originalIndex) => {
    const matchingSignals = input.preferenceSignals.filter((signal) => preferenceMatchesRestaurant(restaurant.name, signal.name));
    const suggestionCount = matchingSignals.reduce((total, signal) => total + signal.suggestionWeight, 0);
    const avoidCount = matchingSignals.reduce((total, signal) => total + signal.avoidWeight, 0);
    const communityScore = Math.min(suggestionCount, 20) * 5
      - Math.min(avoidCount, 20) * 7;
    return {
      restaurant: { ...restaurant, suggestionCount, avoidCount },
      originalIndex,
      communityScore,
      missingAllergyCount: restaurant.missingAllergies?.length || 0,
    };
  });

  const ordered = rankWithCommunityPopularity(ranked);

  return { ...payload, restaurants: ordered.map((item) => item.restaurant) };
}

async function cacheKeyFor(input: SearchInput, mode: "free" | "premium") {
  return restaurantSearchCacheKey({
    mode,
    location: input.location,
    food: input.food,
    allergies: input.allergies,
  });
}

function sanitizeCachedPayload(input: SearchInput, mode: "free" | "premium", payload: PublicDiscoveryPayload): PublicDiscoveryPayload {
  return {
    ...payload,
    mode,
    restaurants: payload.restaurants
      .filter((restaurant) => !isIneligibleGenericChain(input, restaurant))
      .map((restaurant) => ({ ...restaurant, source: mode === "free" ? "free" as const : "ai" as const })),
  };
}

async function readBestPreviousSearchCache(input: SearchInput, mode: "free" | "premium") {
  const previousVersions = [24, 23, 22, 21, 20, 19, 18, 17];
  // Older builds accidentally stored some Free searches under the Premium
  // cache namespace for whitelisted users. Read both namespaces so a strong,
  // already generated answer is not lost merely because that routing bug was
  // fixed. The source labels are normalized below for the requested mode.
  const cacheModes: Array<"free" | "premium"> = [mode, mode === "free" ? "premium" : "free"];
  const payloads = await Promise.all(cacheModes.flatMap((cachedMode) => previousVersions.map(async (version) => {
    const key = await restaurantSearchCacheKey({
      mode: cachedMode,
      location: input.location,
      food: input.food,
      allergies: input.allergies,
    }, version);
    return readRestaurantSearchCache<PublicDiscoveryPayload>(key).catch(() => null);
  })));
  return payloads
    .filter((payload): payload is PublicDiscoveryPayload => Boolean(payload))
    .map((payload) => sanitizeCachedPayload(input, mode, payload))
    .sort((a, b) => b.restaurants.length - a.restaurants.length)[0] || null;
}

async function runCachedPublicDiscovery(input: SearchInput, mode: "free" | "premium") {
  const cacheKey = await cacheKeyFor(input, mode);
  const cached = await readRestaurantSearchCache<PublicDiscoveryPayload>(cacheKey).catch(() => null);
  const sanitizedCached = cached ? sanitizeCachedPayload(input, mode, cached) : null;
  if (sanitizedCached && sanitizedCached.restaurants.length >= 5) return { data: sanitizedCached, cacheStatus: "hit" as const };
  const previous = await readBestPreviousSearchCache(input, mode);
  try {
    const data = await runAiDiscovery(input, mode);
    const sanitized = sanitizeCachedPayload(input, mode, data);
    const strongest = previous && previous.restaurants.length > sanitized.restaurants.length ? previous : sanitized;
    if (strongest.restaurants.length) await writeRestaurantSearchCache(cacheKey, mode, strongest).catch((error) => console.error("Restaurant cache write failed", error));
    return { data: strongest, cacheStatus: strongest === previous ? "stale" as const : "miss" as const };
  } catch (error) {
    if (previous?.restaurants.length) {
      await writeRestaurantSearchCache(cacheKey, mode, previous).catch((cacheError) => console.error("Restaurant cache recovery write failed", cacheError));
      return { data: previous, cacheStatus: "stale" as const };
    }
    throw error;
  }
}

export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });
  const access = await getAccountAccess(session);
  const whitelisted = access.whitelisted || access.admin;
  const premiumAccess = access.premium;
  const requestedMode = request.nextUrl.searchParams.get("mode") === "premium" ? "premium" : "free";
  const mode = requestedMode;
  const location = cityOnlyLocation(request.nextUrl.searchParams.get("location") || "");
  const food = request.nextUrl.searchParams.get("food")?.trim().toLowerCase() || "";
  const occasion = request.nextUrl.searchParams.get("occasion")?.trim().toLowerCase() || "";
  const priceRange = request.nextUrl.searchParams.get("price")?.trim() || "";
  const suggestedRestaurants = [
    request.nextUrl.searchParams.get("suggestedRestaurants") || "",
    request.nextUrl.searchParams.get("suggestedRestaurant") || "",
  ].join("|")
    .split("|")
    .map((item) => item.trim().slice(0, 120))
    .filter(Boolean)
    .slice(0, 8);
  const avoidedRestaurants = [
    request.nextUrl.searchParams.get("avoidedRestaurants") || "",
    request.nextUrl.searchParams.get("avoidedRestaurant") || "",
  ].join("|")
    .split("|")
    .map((item) => item.trim().slice(0, 120))
    .filter(Boolean)
    .slice(0, 8);
  const allergies = (request.nextUrl.searchParams.get("allergies") || "")
    .split("|")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 20);

  if (!location) {
    return NextResponse.json({ error: "Enter a location to search." }, { status: 400 });
  }

  if (mode === "premium" && !premiumAccess) {
    return NextResponse.json({ error: "Choose a Premium plan to use unlimited searches and the full ranked list.", premiumRequired: true }, { status: 402 });
  }

  const input = await withPublicPreferences({
    location,
    latitude: undefined,
    longitude: undefined,
    food,
    occasion,
    priceRange,
    allergies,
    suggestedRestaurants,
    avoidedRestaurants,
    preferenceSignals: [],
  });

  if (mode === "free") {
    const usage = dailyUsage(request);
    const dailyLimit = FREE_DAILY_LIMIT + dailySuggestionBonus(request, usage.today);
    if (!whitelisted && usage.count >= dailyLimit) {
      return NextResponse.json({ error: `You have used today's ${dailyLimit} Free searches. Premium searches are unlimited.`, premiumRequired: true, freeSearchesRemaining: 0, freeSearchesLimit: dailyLimit }, { status: 429 });
    }
    try {
      const { data, cacheStatus } = await runCachedPublicDiscovery(input, "free");
      const rankedData = applyWebsitePreferenceRanking(input, data);
      const nextCount = whitelisted ? usage.count : usage.count + 1;
      const visibleRestaurants = rankedData.restaurants.slice(0, 3);
      await recordUserSearch({
        userId: session?.user.id,
        mode: "free",
        location,
        food,
        allergies,
        resultCount: rankedData.restaurants.length,
      });
      const response = NextResponse.json(
        {
          ...rankedData,
          restaurants: visibleRestaurants,
          totalResultCount: rankedData.restaurants.length,
          lockedResultCount: Math.max(0, rankedData.restaurants.length - visibleRestaurants.length),
          cacheStatus,
          cachePolicy: "unlimited-ai-cache-community-live",
          whitelisted,
          premiumAccess,
          freeSearchesRemaining: whitelisted ? null : Math.max(0, dailyLimit - nextCount),
          freeSearchesLimit: whitelisted ? null : dailyLimit,
        },
        { headers: { "Cache-Control": "private, no-store" } },
      );
      return whitelisted ? response : setDailyUsage(response, usage.today, nextCount);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Free restaurant search failed.";
      return NextResponse.json({ error: message, freeSearchesRemaining: whitelisted ? null : dailyLimit - usage.count, freeSearchesLimit: whitelisted ? null : dailyLimit }, { status: 502 });
    }
  }

  try {
    const { data, cacheStatus } = await runCachedPublicDiscovery(input, "premium");
    const rankedData = applyWebsitePreferenceRanking(input, data);
    await recordUserSearch({
      userId: session?.user.id,
      mode: "premium",
      location,
      food,
      allergies,
      resultCount: rankedData.restaurants.length,
    });
    return NextResponse.json({
      ...rankedData,
      cacheStatus,
      cachePolicy: "unlimited-ai-cache-community-live",
      whitelisted,
      premiumAccess,
      freeSearchesRemaining: whitelisted ? null : undefined,
      freeSearchesLimit: whitelisted ? null : undefined,
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Premium restaurant search failed.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
