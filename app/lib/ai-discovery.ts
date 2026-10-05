import { verifyAndRankRestaurants } from "./restaurant-verification";

export type DiscoveryInput = {
  location: string;
  latitude?: number;
  longitude?: number;
  food: string;
  occasion: string;
  priceRange?: string;
  allergies: string[];
};

export type AiRestaurantLocation = {
  latitude?: number;
  longitude?: number;
  label: string;
  address: string;
  website: string;
  sourceUrl: string;
};

export type AiDiscoveredRestaurant = {
  guideName?: string;
  guideRank?: number;
  guideLabel?: string;
  fsqPlaceId?: string;
  phone?: string;
  distanceKm?: number | null;
  latitude?: number | null;
  longitude?: number | null;
  evidenceRank?: number;
  confidence?: "strong" | "medium" | "weak";
  crossContaminationWarning?: string;
  evidenceSources?: Array<{ title: string; url: string; quote: string }>;
  sourceUrls?: string[];
  websiteStatus?: "verified" | "unverified" | "missing";
  checkedAt?: string;
  locationConfirmed?: boolean;
  foodConfirmed?: boolean;
  allergenEvidence?: Array<{ allergy: string; quote: string; url: string }>;
  name: string;
  cuisine: string[];
  website: string;
  menuSourceUrl: string;
  qualitySourceUrl: string;
  evidenceSummary: string;
  popularitySummary: string;
  rankingReason: string;
  supportedAllergies: string[];
  missingAllergies: string[];
  locations: AiRestaurantLocation[];
  /** Internal model rubric. Never displayed as a consumer rating. */
  popularityTier?: number;
  allergyConfidenceTier?: number;
  foodRelevanceTier?: number;
  /** Evidence-backed match category; community votes only reorder peers. */
  matchQuality?: number;
  dedicatedGlutenFree?: boolean;
  rating?: number | null;
  reviewCount?: number | null;
  popularitySourceUrl?: string;
};

type OpenAIResponse = {
  output?: Array<{ type?: string; content?: Array<{ type?: string; text?: string }> }>;
};

function cleanText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function field<T = unknown>(source: Record<string, unknown>, ...names: string[]) {
  for (const name of names) {
    if (source[name] !== undefined) return source[name] as T;
  }
  return undefined;
}

function safeUrl(value: unknown) {
  const text = cleanText(value, 1000);
  try {
    const url = new URL(text);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : "";
  } catch {
    return "";
  }
}

function plausibleRestaurantUrl(value: unknown, restaurantName: string) {
  const text = cleanText(value, 1000);
  if (!text) return "";
  try {
    const url = new URL(text);
    if (!["http:", "https:"].includes(url.protocol)) return "";
    if (/(^|\.)(bing|google|tripadvisor|thefork|yelp|facebook|instagram|tiktok|wikipedia|ubereats|deliveroo|doordash)\./i.test(url.hostname)) return "";
    const host = normalizedName(url.hostname.replace(/^www\./, ""));
    const tokens = normalizedBrandName(restaurantName).split(" ").filter((token) => token.length >= 3 && !/^(bar|cafe|food|grill|burger|restaurant|diner)$/.test(token));
    return tokens.some((token) => host.includes(token)) ? url.toString() : "";
  } catch {
    return "";
  }
}

function normalizedName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\b(restaurants?|nyc|new york)\b/g, "").replace(/\s+/g, " ").trim();
}

function normalizedBrandName(value: string) {
  if (/\bparis\s+new\s+york\b/i.test(value)) return "pny";
  const normalized = normalizedName(value);
  if (/^pny(\b|$)/.test(normalized)) return "pny";
  return normalized
    .replace(/\b(paris|marais|oberkampf|pigalle|sentier|faubourg|saint|germain|republique|montmartre|bastille|chatelet|opera|halles|local branch)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function outputText(data: OpenAIResponse) {
  return (data.output || [])
    .filter((item) => item.type === "message")
    .flatMap((item) => item.content || [])
    .filter((content) => content.type === "output_text" && content.text)
    .map((content) => content.text)
    .join("\n");
}

function matchingAllergies(value: unknown, requested: string[]) {
  if (!Array.isArray(value)) return [];
  const byName = new Map(requested.map((allergy) => [allergy.toLowerCase(), allergy]));
  return [...new Set(value.flatMap((item) => typeof item === "string" && byName.has(item.trim().toLowerCase()) ? [byName.get(item.trim().toLowerCase()) as string] : []))];
}

export async function discoverRestaurants(input: DiscoveryInput) {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return { locationLabel: input.location || "your location", restaurants: [] as AiDiscoveredRestaurant[], status: "skipped" as const };
  }

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        input: [
          {
            role: "system",
            content: "5 real open restaurants; allergy gate; rank popularity>food>allergy. No markets/fake URL/rating. GF burger=GF bun/burger or GF venue, not bunless. Every alg in sa or ma; unsure=ma; cross-contact note in e. Group chains; branch in b. JSON only.",
          },
          {
            role: "user",
            content: JSON.stringify({
              loc: cleanText(input.location, 240),
              food: cleanText(input.food, 100),
              alg: input.allergies.slice(0, 10).map((allergy) => cleanText(allergy, 80)).filter(Boolean),
            }),
          },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "verified_restaurant_locations",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                l: { type: "string" },
                p: {
                  type: "array",
                  maxItems: 5,
                  items: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                      n: { type: "string" },
                      b: { type: "string" },
                      a: { type: "string" },
                      c: { type: "array", items: { type: "string" }, maxItems: 6 },
                      w: { type: "string" },
                      e: { type: "string" },
                      sa: { type: "array", items: { type: "string" } },
                      ma: { type: "array", items: { type: "string" } },
                      pt: { type: "integer", minimum: 3, maximum: 5 },
                      at: { type: "integer", minimum: 3, maximum: 5 },
                      ft: { type: "integer", minimum: 3, maximum: 5 },
                    },
                    required: ["n", "b", "a", "c", "w", "e", "sa", "ma", "pt", "at", "ft"],
                  },
                },
              },
              required: ["l", "p"],
            },
          },
        },
        max_output_tokens: 1200,
        store: false,
      }),
      signal: AbortSignal.timeout(20000),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error("OpenAI restaurant discovery failed", response.status, errorBody.slice(0, 1000));
      const hasNoCredits = response.status === 429 && /no credits|credit_balance_exhausted|insufficient_quota/i.test(errorBody);
      if (hasNoCredits) return { locationLabel: input.location || "your location", restaurants: [] as AiDiscoveredRestaurant[], status: "quota" as const };
      return { locationLabel: input.location || "your location", restaurants: [] as AiDiscoveredRestaurant[], status: "unavailable" as const };
    }

    const data = await response.json() as OpenAIResponse;
    const parsed = JSON.parse(outputText(data)) as { l?: unknown; locationLabel?: unknown; p?: Array<Record<string, unknown>>; places?: Array<Record<string, unknown>> };
    const grouped = new Map<string, AiDiscoveredRestaurant>();

    const places = Array.isArray(parsed.p) ? parsed.p : parsed.places || [];
    for (const place of places.slice(0, 5)) {
      const name = cleanText(field(place, "n", "restaurantName"), 160);
      const label = cleanText(field(place, "b", "branchLabel"), 120) || "Local branch";
      const address = cleanText(field(place, "a", "address"), 300) || `${input.location} · confirm exact branch`;
      const website = plausibleRestaurantUrl(field(place, "w", "website"), name);
      const locationWebsite = plausibleRestaurantUrl(field(place, "lw", "locationWebsite"), name);
      const locationSourceUrl = safeUrl(field(place, "ls", "locationSourceUrl"));
      const menuSourceUrl = plausibleRestaurantUrl(field(place, "m", "menuSourceUrl"), name);
      const qualitySourceUrl = plausibleRestaurantUrl(field(place, "qs", "qualitySourceUrl"), name);
      const evidenceSummary = cleanText(field(place, "e", "evidenceSummary"), 360)
        || "Selected by the restaurant search model for the requested allergy filters; confirm ingredients and cross-contact directly.";
      const popularitySummary = cleanText(field(place, "q", "popularitySummary"), 180)
        || "Selected for local restaurant relevance and public prominence signals.";
      const rankingReason = cleanText(field(place, "r", "rankingReason"), 180)
        || "Ranked by allergy fit, requested food relevance, and local popularity.";
      const supportedAllergies = matchingAllergies(field(place, "sa", "supportedAllergies"), input.allergies);
      const explicitMissing = matchingAllergies(field(place, "ma", "missingAllergies"), input.allergies);
      const missingAllergies = input.allergies.filter((allergy) => explicitMissing.some((item) => item.toLowerCase() === allergy.toLowerCase()) || !supportedAllergies.some((item) => item.toLowerCase() === allergy.toLowerCase()));
      const popularityTier = Math.max(3, Math.min(5, Number(field(place, "pt", "popularityTier")) || 3));
      const allergyConfidenceTier = Math.max(3, Math.min(5, Number(field(place, "at", "allergyConfidenceTier")) || 3));
      const foodRelevanceTier = Math.max(3, Math.min(5, Number(field(place, "ft", "foodRelevanceTier")) || 3));
      const cuisineInput = field<unknown[]>(place, "c", "cuisine");
      const cuisine = Array.isArray(cuisineInput)
        ? cuisineInput.slice(0, 6).map((item) => cleanText(item, 80)).filter(Boolean)
        : [];
      if (!name) continue;

      const mapFallback = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${name} ${address}`)}`;
      const resolvedWebsite = website || locationWebsite || locationSourceUrl || mapFallback;
      const location = { label, address, website: locationWebsite || resolvedWebsite, sourceUrl: locationSourceUrl || mapFallback };
      const brandKey = normalizedBrandName(`${name} ${label}`);
      const key = brandKey === "pny" ? "pny" : normalizedBrandName(name);
      const existing = grouped.get(key);
      if (existing) {
        if (!existing.locations.some((item) => normalizedName(item.address) === normalizedName(address))) existing.locations.push(location);
        if (key.length <= 5) existing.name = key.toUpperCase();
        existing.cuisine = [...new Set([...existing.cuisine, ...cuisine])].slice(0, 6);
      } else {
        grouped.set(key, { name: key.length <= 5 ? key.toUpperCase() : name, cuisine, website: resolvedWebsite, menuSourceUrl: menuSourceUrl || resolvedWebsite, qualitySourceUrl: qualitySourceUrl || resolvedWebsite, evidenceSummary: `${evidenceSummary} AI assessment only; confirm ingredients and cross-contact directly.`, popularitySummary, rankingReason, supportedAllergies, missingAllergies, locations: [location], popularityTier, allergyConfidenceTier, foodRelevanceTier });
      }
    }

    const restaurants = [...grouped.values()].sort((a, b) =>
      (b.popularityTier || 0) - (a.popularityTier || 0)
      || (b.allergyConfidenceTier || 0) - (a.allergyConfidenceTier || 0)
      || (b.foodRelevanceTier || 0) - (a.foodRelevanceTier || 0));
    const locationLabel = cleanText(parsed.l ?? parsed.locationLabel, 240) || input.location || "your location";
    const verifiedRestaurants = await verifyAndRankRestaurants(restaurants, input);
    return { locationLabel, restaurants: verifiedRestaurants, status: verifiedRestaurants.length ? "used" as const : "empty" as const, provider: verifiedRestaurants.length ? "OpenAI" : undefined };
  } catch (error) {
    console.error("OpenAI restaurant discovery error", error);
    return { locationLabel: input.location || "your location", restaurants: [] as AiDiscoveredRestaurant[], status: "unavailable" as const };
  }
}
