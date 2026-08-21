import { NextRequest, NextResponse } from "next/server";
import { discoverRestaurants } from "@/app/lib/ai-discovery";
import { discoverRestaurantLeadsWithNvidia, type WeightedPreferenceSignal } from "@/app/lib/nvidia-discovery";
import { discoverFreeRestaurants } from "@/app/lib/free-discovery";
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

function envList(name: string) {
  return (process.env[name] || "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function isWhitelistedUser(session: Awaited<ReturnType<typeof auth.api.getSession>>) {
  if (!session?.user) return false;
  const emails = envList("SEARCH_WHITELIST_EMAILS");
  const userIds = envList("SEARCH_WHITELIST_USER_IDS");
  return Boolean(
    session.user.email && emails.includes(session.user.email.toLowerCase())
    || userIds.includes(session.user.id.toLowerCase()),
  );
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

function publicPreferenceData(input: SearchInput) {
  const location = normalizedScope(input.location);
  const allergies = allergyScope(input.allergies);
  const food = normalizedScope(input.food);
  return getDb().select().from(restaurantPreference).limit(5000).then((rows) => {
    const signals = new Map<string, WeightedPreferenceSignal>();
    const suggestedCounts = new Map<string, { name: string; count: number }>();
    const avoidedCounts = new Map<string, { name: string; count: number }>();
    for (const row of rows) {
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

      if (!scopeOverlaps(row.locationScope, location, "location")) continue;
      if (!scopeOverlaps(row.allergyScope, allergies, "allergy")) continue;
      if (row.foodScope && food && !scopeOverlaps(row.foodScope, food, "food")) continue;
      if (row.foodScope && !food) continue;
      const counts = row.kind === "suggest" ? suggestedCounts : avoidedCounts;
      const existing = counts.get(row.normalizedName);
      if (existing) existing.count += 1;
      else counts.set(row.normalizedName, { name: row.name, count: 1 });
    }
    const weightedNames = (counts: Map<string, { name: string; count: number }>, kind: "suggest" | "avoid") => [...counts.values()]
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
      .flatMap((item) => Array.from({ length: kind === "suggest" ? Math.min(item.count, 4) : 1 }, () => item.name))
      .slice(0, 12);
    return {
      preferenceSignals: [...signals.values()].sort((a, b) =>
        (b.suggestionWeight + b.avoidWeight) - (a.suggestionWeight + a.avoidWeight)
        || a.name.localeCompare(b.name)),
      publicSuggested: weightedNames(suggestedCounts, "suggest"),
      publicAvoided: weightedNames(avoidedCounts, "avoid"),
    };
  }).catch(() => ({ preferenceSignals: [] as WeightedPreferenceSignal[], publicSuggested: [] as string[], publicAvoided: [] as string[] }));
}

async function withPublicPreferences(input: SearchInput): Promise<SearchInput> {
  const { preferenceSignals, publicSuggested, publicAvoided } = await publicPreferenceData(input);
  return {
    ...input,
    preferenceSignals,
    suggestedRestaurants: [...input.suggestedRestaurants, ...publicSuggested].slice(0, 24),
    avoidedRestaurants: [...new Set([...input.avoidedRestaurants, ...publicAvoided])].slice(0, 12),
  };
}

async function runPublicDiscovery(input: SearchInput, requestedMode: "free" | "premium") {
  const nvidiaDiscovery = await discoverRestaurantLeadsWithNvidia({
    location: input.location || (input.latitude !== undefined && input.longitude !== undefined ? `${input.latitude}, ${input.longitude}` : ""),
    food: input.food,
    occasion: input.occasion,
    priceRange: input.priceRange,
    allergies: input.allergies,
    suggestedRestaurants: [...new Set(input.suggestedRestaurants)],
    avoidedRestaurants: input.avoidedRestaurants,
    preferenceSignals: input.preferenceSignals,
  });
  const discovery = await discoverFreeRestaurants({
    ...input,
    nvidiaLeads: nvidiaDiscovery.leads,
  });
  const restaurants = discovery.restaurants.map((restaurant, index) => ({
    id: `free-${index + 1}-${normalizedId(restaurant.name)}`,
    name: restaurant.name,
    cuisine: restaurant.cuisine,
    address: restaurant.locations[0].address,
    distanceKm: restaurant.distanceKm,
    website: restaurant.website,
    dietary: restaurant.dietary,
    latitude: restaurant.locations[0].latitude,
    longitude: restaurant.locations[0].longitude,
    source: "free" as const,
    sourceUrl: restaurant.menuSourceUrl,
    menuSourceUrl: restaurant.menuSourceUrl,
    qualitySourceUrl: restaurant.qualitySourceUrl,
    evidenceSummary: restaurant.evidenceSummary,
    popularitySummary: restaurant.popularitySummary,
    rankingReason: restaurant.rankingReason,
    rating: restaurant.rating,
    reviewCount: restaurant.reviewCount,
    evidenceTier: restaurant.evidenceTier,
    supportedAllergies: restaurant.supportedAllergies,
    missingAllergies: restaurant.missingAllergies,
    locations: restaurant.locations,
  }));
  return {
    location: discovery.locationLabel,
    restaurants,
    mode: requestedMode,
    agentQuery: discovery.query,
    engine: nvidiaDiscovery.status === "used" ? "nvidia-model-discovery" : "openstreetmap-fallback",
    nvidiaStatus: nvidiaDiscovery.status,
    premiumFallback: requestedMode === "premium",
  };
}

export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });
  const whitelisted = isWhitelistedUser(session);
  const requestedMode = request.nextUrl.searchParams.get("mode") === "premium" ? "premium" : "free";
  const mode = whitelisted ? "premium" : requestedMode;
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
  const latitude = Number(request.nextUrl.searchParams.get("lat"));
  const longitude = Number(request.nextUrl.searchParams.get("lon"));
  const hasCoordinates = request.nextUrl.searchParams.has("lat")
    && request.nextUrl.searchParams.has("lon")
    && Number.isFinite(latitude)
    && Number.isFinite(longitude);

  if (!location && !hasCoordinates) {
    return NextResponse.json({ error: "Enter a location to search." }, { status: 400 });
  }

  const input = await withPublicPreferences({
    location,
    latitude: hasCoordinates ? latitude : undefined,
    longitude: hasCoordinates ? longitude : undefined,
    food,
    occasion,
    priceRange,
    allergies,
    suggestedRestaurants,
    avoidedRestaurants,
    preferenceSignals: [],
  });

  if (requestedMode === "free" && !whitelisted) {
    const usage = dailyUsage(request);
    const dailyLimit = FREE_DAILY_LIMIT + dailySuggestionBonus(request, usage.today);
    if (usage.count >= dailyLimit) {
      return NextResponse.json({ error: `You have used today's ${dailyLimit} Free searches. Premium searches are unlimited.`, freeSearchesRemaining: 0, freeSearchesLimit: dailyLimit }, { status: 429 });
    }
    try {
      const data = await runPublicDiscovery(input, mode);
      const nextCount = usage.count + 1;
      const response = NextResponse.json(
        { ...data, freeSearchesRemaining: Math.max(0, dailyLimit - nextCount), freeSearchesLimit: dailyLimit },
        { headers: { "Cache-Control": "private, no-store" } },
      );
      return setDailyUsage(response, usage.today, nextCount);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Free restaurant search failed.";
      return NextResponse.json({ error: message, freeSearchesRemaining: dailyLimit - usage.count, freeSearchesLimit: dailyLimit }, { status: 502 });
    }
  }

  const discovery = await discoverRestaurants({
    ...input,
    suggestedRestaurants: [...new Set(input.suggestedRestaurants)],
  });

  if (discovery.status === "skipped" || discovery.status === "quota") {
    try {
      const data = await runPublicDiscovery(input, mode);
      return NextResponse.json(
        {
          ...data,
          aiStatus: discovery.status,
          premiumFallbackReason: discovery.status === "quota" ? "openai-quota" : "openai-key-missing",
          whitelisted,
          freeSearchesRemaining: whitelisted ? null : undefined,
          freeSearchesLimit: whitelisted ? null : undefined,
        },
        { headers: { "Cache-Control": "private, no-store" } },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Premium fallback search failed.";
      return NextResponse.json({ error: message }, { status: 502 });
    }
  }
  if (discovery.status === "unavailable") {
    return NextResponse.json({ error: "OpenAI restaurant research is temporarily unavailable. Please try again." }, { status: 502 });
  }

  const restaurants = discovery.restaurants.map((restaurant, index) => ({
    id: `ai-${index + 1}-${normalizedId(restaurant.name)}`,
    name: restaurant.name,
    cuisine: restaurant.cuisine,
    address: restaurant.locations[0].address,
    distanceKm: null,
    website: restaurant.website,
    dietary: {},
    latitude: null,
    longitude: null,
    source: "ai" as const,
    sourceUrl: restaurant.menuSourceUrl,
    menuSourceUrl: restaurant.menuSourceUrl,
    qualitySourceUrl: restaurant.qualitySourceUrl,
    evidenceSummary: restaurant.evidenceSummary,
    popularitySummary: restaurant.popularitySummary,
    rankingReason: restaurant.rankingReason,
    locations: restaurant.locations,
  }));

  return NextResponse.json(
    {
      location: discovery.locationLabel,
      restaurants,
      aiStatus: discovery.status,
      mode,
      premiumFallback: false,
      whitelisted,
      freeSearchesRemaining: whitelisted ? null : undefined,
      freeSearchesLimit: whitelisted ? null : undefined,
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
