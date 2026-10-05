import { NextRequest, NextResponse } from "next/server";
import type { AiDiscoveredRestaurant } from "@/app/lib/ai-discovery";
import { discoverRestaurants } from "../../lib/guided-discovery";
import { getAccountAccess } from "@/app/lib/premium";
import { applyCommunityPreferences, createCommunityRestaurant, preferenceMatchesContext, visibleRestaurantResults, type PublicPreference } from "../../lib/community-preferences";
import { isPlausibleRestaurantName } from "@/app/lib/restaurant-result-validation";
import { readRestaurantSearchCache, restaurantSearchCacheKey, writeRestaurantSearchCache } from "@/app/lib/search-cache";
import { recordUserSearch } from "@/app/lib/user-searches";
import { getDb } from "../../../db";
import { restaurantPreference, restaurantRating } from "../../../db/schema";
import { inArray } from "drizzle-orm";
import { restaurantRatingKey } from "../../lib/rating-key";
import { auth } from "../../lib/auth";
import { cityGuideRestaurants } from "../../lib/city-guide";
import { sameRestaurantBrand } from "../../lib/restaurant-identity";

const FREE_DAILY_LIMIT = 3;
const FREE_SUGGESTION_BONUS = 1;
const FREE_SEARCH_COOKIE = "safeserve_free_searches";
const FREE_SUGGESTION_COOKIE = "safeserve_suggestion_bonus";

function normalizedId(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
}

function normalizedScope(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 120);
}

function allergyScope(allergies: string[]) {
  return allergies.map(normalizedScope).filter(Boolean).sort().join("|").slice(0, 240);
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
  query?: string;
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
  return getDb().select().from(restaurantPreference).then((rows) => {
    const signals = new Map<string, WeightedPreferenceSignal>();
    for (const row of rows) {
      if (!preferenceMatchesContext(row, { locationScope: location, allergyScope: allergies, foodScope: food })) continue;

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
    suggestedRestaurants: [...new Set([...input.suggestedRestaurants, ...preferenceSignals.filter(signal => signal.suggestionWeight > 0).map(signal => signal.name)])].slice(0, 8),
  };
}

function filterAllergyEligibleRestaurants(input: SearchInput, restaurants: AiDiscoveredRestaurant[]) {
  // Only invalid names are removed. Uncertain menus and unavailable websites
  // remain visible, with missing evidence and map links instead of guesses.
  return restaurants.filter(restaurant => isPlausibleRestaurantName(restaurant.name, input.food, input.allergies));
}

function resultPayload(restaurants: AiDiscoveredRestaurant[], source: "free" | "ai") {
  return restaurants.map((restaurant, index) => ({
    id: `${source}-${index + 1}-${normalizedId(restaurant.name)}`,
    discoveryRank: index,
    guideRank: restaurant.guideRank,
    guideName: restaurant.guideName,
    guideLabel: restaurant.guideLabel,
    matchQuality: restaurant.matchQuality || 0,
    popularityTier: restaurant.popularityTier || 0,
    communityRating: null as number | null,
    name: restaurant.name,
    cuisine: restaurant.cuisine,
    address: restaurant.locations[0].address,
    distanceKm: restaurant.distanceKm ?? null,
    phone: restaurant.phone,
    confidence: restaurant.confidence,
    evidenceRank: restaurant.evidenceRank,
    evidenceSources: restaurant.evidenceSources,
    sourceUrls: restaurant.sourceUrls,
    crossContaminationWarning: restaurant.crossContaminationWarning,
    website: restaurant.website,
    websiteStatus: restaurant.websiteStatus,
    checkedAt: restaurant.checkedAt,
    dietary: {},
    latitude: restaurant.latitude ?? null,
    longitude: restaurant.longitude ?? null,
    source,
    sourceUrl: restaurant.locations[0].sourceUrl,
    menuSourceUrl: restaurant.menuSourceUrl,
    qualitySourceUrl: restaurant.qualitySourceUrl,
    evidenceSummary: restaurant.evidenceSummary,
    popularitySummary: restaurant.popularitySummary,
    rankingReason: restaurant.rankingReason,
    rating: restaurant.rating ?? null,
    reviewCount: restaurant.reviewCount ?? null,
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
    query: input.query,
    latitude: input.latitude,
    longitude: input.longitude,
    food: input.food,
    occasion: input.occasion,
    priceRange: input.priceRange,
    allergies: input.allergies,
    suggestedRestaurants: input.suggestedRestaurants,
  };
  const discovery = await discoverRestaurants(discoveryInput);
  if (discovery.status !== "used") {
    const reason = discovery.status === "skipped"
      ? "OpenRouter search is not configured on this local server. Add GOOGLE_API_KEY or OPENROUTER_API_KEY and restart localhost."
      : discovery.status === "authentication"
        ? "The search service's OpenRouter key was rejected. The site administrator needs to check its API key and permissions."
      : discovery.status === "credits"
        ? "The search service needs OpenRouter credits. The site administrator needs to check its balance or spending limit."
      : discovery.status === "quota"
        ? "OpenRouter search is temporarily out of quota. Try again after the provider limit resets."
        : "OpenRouter search is temporarily unavailable. Try again in a moment.";
    throw new Error(reason);
  }
  const resultSource: "free" | "ai" = requestedMode === "free" ? "free" : "ai";
  const premiumFallback = false;
  const restaurants = filterAllergyEligibleRestaurants(input, discovery.restaurants);
  return {
    location: discovery.locationLabel || input.location,
    restaurants: resultPayload(restaurants, resultSource),
    mode: requestedMode,
    agentQuery: [input.location, input.food, ...input.allergies].filter(Boolean).join(" · "),
    aiProvider: discovery.provider,
    aiModel: discovery.model,
    searchWarning: "searchWarning" in discovery ? discovery.searchWarning : undefined,
    premiumFallback,
  };
}

type PublicDiscoveryPayload = Awaited<ReturnType<typeof runAiDiscovery>>;

/** Votes are reapplied to cached discovery results without running the AI. */
async function applyWebsitePreferenceRanking(input: SearchInput, payload: PublicDiscoveryPayload): Promise<PublicDiscoveryPayload> {
  const preferences: PublicPreference[] = input.preferenceSignals.flatMap(signal => [
    { kind: "suggest" as const, name: signal.name, count: signal.suggestionWeight },
    { kind: "avoid" as const, name: signal.name, count: signal.avoidWeight },
  ]);
  const candidates = applyCommunityPreferences(payload.restaurants, preferences, (name, index) => {
    const suggestion = createCommunityRestaurant(name, index, { ...input, mode: payload.mode });
    return { ...resultPayload([suggestion], payload.mode === "free" ? "free" : "ai")[0], id: suggestion.id, discoveryRank: index };
  });
  const keys = candidates.map(restaurant => restaurantRatingKey(restaurant.name, restaurant.address));
  const averages = new Map<string, { sum: number; count: number }>();
  if (keys.length) {
    try {
      const rows = await getDb().select({ key: restaurantRating.restaurantKey, stars: restaurantRating.stars }).from(restaurantRating).where(inArray(restaurantRating.restaurantKey, keys));
      for (const row of rows) { const value = averages.get(row.key) || { sum: 0, count: 0 }; value.sum += row.stars; value.count++; averages.set(row.key, value); }
    } catch { /* Ratings being unavailable must not erase search results. */ }
  }
  const restaurants = candidates.map(restaurant => { const value = averages.get(restaurantRatingKey(restaurant.name, restaurant.address)); return { ...restaurant, communityRating: value ? value.sum / value.count : null }; });
  return { ...payload, restaurants: applyCommunityPreferences(restaurants, preferences) };
}

async function cacheKeyFor(input: SearchInput, mode: "free" | "premium") {
  return restaurantSearchCacheKey({
    mode,
    location: input.location,
    food: [input.query, input.food].filter(Boolean).join(" "),
    latitude: input.latitude,
    longitude: input.longitude,
    allergies: input.allergies,
    suggestedRestaurants: input.suggestedRestaurants,
  });
}

function sanitizeCachedPayload(input: SearchInput, mode: "free" | "premium", payload: PublicDiscoveryPayload): PublicDiscoveryPayload {
  const source = mode === "free" ? "free" as const : "ai" as const;
  const cachedRestaurants = payload.restaurants
    .filter((restaurant) => isPlausibleRestaurantName(restaurant.name, input.food, input.allergies))
    .map((restaurant) => ({ ...restaurant, source }));
  const currentGuide = resultPayload(cityGuideRestaurants(input), source);
  const restaurants = currentGuide.length ? [
    ...currentGuide.map((guideRestaurant, index) => {
      const cachedRestaurant = cachedRestaurants.find(restaurant => sameRestaurantBrand(restaurant.name, guideRestaurant.name));
      return cachedRestaurant ? {
        ...guideRestaurant,
        ...cachedRestaurant,
        id: guideRestaurant.id,
        discoveryRank: index,
        name: guideRestaurant.name,
        guideRank: guideRestaurant.guideRank,
        guideName: guideRestaurant.guideName,
        guideLabel: guideRestaurant.guideLabel,
        supportedAllergies: guideRestaurant.supportedAllergies,
        missingAllergies: guideRestaurant.missingAllergies,
        rankingReason: guideRestaurant.rankingReason,
        source,
      } : guideRestaurant;
    }),
    ...cachedRestaurants.filter(restaurant => !restaurant.guideRank && !currentGuide.some(guideRestaurant => sameRestaurantBrand(restaurant.name, guideRestaurant.name))),
  ].slice(0, 9) : cachedRestaurants;
  return {
    ...payload,
    mode,
    aiProvider: payload.aiProvider || "Cached result",
    restaurants,
  };
}

const inFlightSearches = new Map<string, Promise<PublicDiscoveryPayload>>();

async function runCachedPublicDiscovery(input: SearchInput, mode: "free" | "premium") {
  const cacheKey = await cacheKeyFor(input, mode);
  const cached = await readRestaurantSearchCache<PublicDiscoveryPayload>(cacheKey).catch(() => null);
  const sanitizedCached = cached ? sanitizeCachedPayload(input, mode, cached) : null;
  if (sanitizedCached?.restaurants.length) return { data: sanitizedCached, cacheStatus: "hit" as const };
  const stale = await readRestaurantSearchCache<PublicDiscoveryPayload>(cacheKey, { allowStale: true }).catch(() => null);
  const sanitizedStale = stale ? sanitizeCachedPayload(input, mode, stale) : null;
  let pending = inFlightSearches.get(cacheKey);
  if (!pending) {
    pending = (async () => {
      const data = await runAiDiscovery(input, mode);
      if (data.restaurants.length) await writeRestaurantSearchCache(cacheKey, mode, data).catch(error => console.error("Restaurant cache write failed", error));
      return data;
    })();
    inFlightSearches.set(cacheKey, pending);
  }
  let data: PublicDiscoveryPayload;
  try { data = sanitizeCachedPayload(input, mode, await pending); }
  catch (error) {
    if (!sanitizedStale?.restaurants.length) throw error;
    return {
      data: {
        ...sanitizedStale,
        aiProvider: "Saved search",
        searchWarning: "OpenRouter is unavailable, so these are the latest saved results for this search.",
      },
      cacheStatus: "stale" as const,
    };
  }
  finally { if (inFlightSearches.get(cacheKey) === pending) inFlightSearches.delete(cacheKey); }
  return { data, cacheStatus: "miss" as const };
}

export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });
  const access = await getAccountAccess(session);
  const whitelisted = access.whitelisted || access.admin;
  const premiumAccess = access.premium;
  const requestedMode = request.nextUrl.searchParams.get("mode") === "premium" ? "premium" : "free";
  const mode = requestedMode;
  const location = (request.nextUrl.searchParams.get("location") || "").split(",")[0].trim().replace(/\s+/g, " ").slice(0, 240);
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

  const coordinate = (name: string, max: number) => {
    const raw = request.nextUrl.searchParams.get(name);
    const value = raw === null || !raw.trim() ? NaN : Number(raw);
    return Number.isFinite(value) && Math.abs(value) <= max ? value : undefined;
  };
  const input = await withPublicPreferences({
    location,
    query: (request.nextUrl.searchParams.get("query") || request.nextUrl.searchParams.get("q") || "").trim().slice(0, 300),
    latitude: coordinate("latitude", 90),
    longitude: coordinate("longitude", 180),
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
      const rankedData = await applyWebsitePreferenceRanking(input, data);
      const nextCount = whitelisted ? usage.count : usage.count + 1;
      const visibleRestaurants = visibleRestaurantResults(rankedData.restaurants);
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
    const rankedData = await applyWebsitePreferenceRanking(input, data);
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
