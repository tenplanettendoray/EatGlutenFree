import { NextRequest, NextResponse } from "next/server";
import type { AiDiscoveredRestaurant } from "@/app/lib/ai-discovery";
import { discoverRestaurantsWithOpenRouter } from "@/app/lib/openrouter-discovery";
import { getAccountAccess } from "@/app/lib/premium";
import { rankWithCommunityPopularity } from "@/app/lib/community-ranking";
import { isPlausibleRestaurantName } from "@/app/lib/restaurant-result-validation";
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
  const withoutGenericChains = restaurants.filter((restaurant) =>
    isPlausibleRestaurantName(restaurant.name, input.food, input.allergies)
    && !isIneligibleGenericChain(input, restaurant));
  if (!input.allergies.length) return withoutGenericChains;
  const fullySupported = withoutGenericChains.filter((restaurant) => restaurant.missingAllergies.length === 0);
  if (fullySupported.length >= 5) return fullySupported;
  const partial = withoutGenericChains.filter((restaurant) => restaurant.missingAllergies.length > 0);
  return [...fullySupported, ...partial];
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
    allergenEvidence: restaurant.allergenEvidence || [],
    locations: restaurant.locations,
  }));
}

async function runAiDiscovery(input: SearchInput, requestedMode: "free" | "premium") {
  const discoveryInput = {
    location: input.location,
    latitude: undefined,
    longitude: undefined,
    food: input.food,
    occasion: input.occasion,
    priceRange: input.priceRange,
    allergies: input.allergies,
  };
  const discovery = await discoverRestaurantsWithOpenRouter(discoveryInput);
  const resultSource: "free" | "ai" = requestedMode === "free" ? "free" : "ai";
  const premiumFallback = false;
  if (discovery.status !== "used") {
    throw new Error(discovery.failureReason);
  }
  const restaurants = filterAllergyEligibleRestaurants(input, discovery.restaurants);
  return {
    location: discovery.locationLabel || input.location,
    restaurants: resultPayload(restaurants, resultSource),
    mode: requestedMode,
    agentQuery: [input.location, input.food, ...input.allergies].filter(Boolean).join(" · "),
    aiProvider: discovery.provider,
    aiModel: discovery.model,
    searchWarning: "warning" in discovery ? discovery.warning : undefined,
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
        allergenEvidence: [],
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
      isCommunitySuggestion: restaurant.id.startsWith("community-"),
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
    aiProvider: payload.aiProvider || "Cached result",
    restaurants: payload.restaurants
      .filter((restaurant) => !isIneligibleGenericChain(input, restaurant))
      .map((restaurant) => ({ ...restaurant, source: mode === "free" ? "free" as const : "ai" as const })),
  };
}

async function runCachedPublicDiscovery(input: SearchInput, mode: "free" | "premium") {
  const cacheKey = await cacheKeyFor(input, mode);
  const cached = await readRestaurantSearchCache<PublicDiscoveryPayload>(cacheKey).catch(() => null);
  const sanitizedCached = cached ? sanitizeCachedPayload(input, mode, cached) : null;
  if (sanitizedCached?.restaurants.length) return { data: sanitizedCached, cacheStatus: "hit" as const };
  const data = sanitizeCachedPayload(input, mode, await runAiDiscovery(input, mode));
  // Never revive legacy AI/map answers or select an answer just because it is longer.
  if (data.restaurants.length && !data.searchWarning) await writeRestaurantSearchCache(cacheKey, mode, data).catch(error => console.error("Restaurant cache write failed", error));
  return { data, cacheStatus: "miss" as const };
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
