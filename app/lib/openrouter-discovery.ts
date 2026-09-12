import type { AiDiscoveredRestaurant } from "@/app/lib/ai-discovery";

type DiscoveryInput = {
  location: string;
  latitude?: number;
  longitude?: number;
  food: string;
  allergies: string[];
};

type ChatCompletionResponse = {
  choices?: Array<{ message?: {
    content?: string | Array<string | { text?: string }> | null;
    tool_calls?: Array<{ function?: { name?: string; arguments?: string } }>;
  } }>;
};

type ChatMessageContent = string | Array<string | { text?: string }> | null | undefined;

function cleanText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function field<T = unknown>(source: Record<string, unknown>, ...names: string[]) {
  for (const name of names) {
    if (source[name] !== undefined) return source[name] as T;
  }
  return undefined;
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

function contentText(content: ChatMessageContent) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.map((part) => typeof part === "string" ? part : cleanText(part?.text, 100000)).join("");
}

function parseJsonObject(content: string): { l?: unknown; locationLabel?: unknown; p?: unknown; places?: unknown; restaurants?: unknown; results?: unknown } {
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const source = (fenced || content).trim();
  const objectStart = source.indexOf("{");
  const arrayStart = source.indexOf("[");
  const startsWithArray = arrayStart >= 0 && (objectStart < 0 || arrayStart < objectStart);
  const start = startsWithArray ? arrayStart : objectStart;
  const end = startsWithArray ? source.lastIndexOf("]") : source.lastIndexOf("}");
  if (start < 0 || end <= start) return {};
  try {
    const parsed = JSON.parse(source.slice(start, end + 1)) as unknown;
    return Array.isArray(parsed) ? { p: parsed } : parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function requestedAllergies(value: unknown, requested: string[]) {
  if (!Array.isArray(value)) return [];
  const requestedMap = new Map(requested.map((allergy) => [allergy.toLowerCase(), allergy]));
  return [...new Set(value.flatMap((item) => {
    if (typeof item !== "string") return [];
    const match = requestedMap.get(item.trim().toLowerCase());
    return match ? [match] : [];
  }))];
}

function rankingTier(value: unknown) {
  const tier = Number(value);
  return Number.isFinite(tier) ? Math.max(3, Math.min(5, Math.round(tier))) : 3;
}

function plausibleRestaurantUrl(value: unknown, restaurantName: string) {
  const text = cleanText(value, 1000);
  if (!text) return "";
  try {
    const url = new URL(text);
    if (!["http:", "https:"].includes(url.protocol)) return "";
    if (/(^|\.)(bing|google|tripadvisor|thefork|yelp|facebook|instagram|tiktok|wikipedia|ubereats|deliveroo|doordash)\./i.test(url.hostname)) return "";
    const host = normalizedName(url.hostname.replace(/^www\./, ""));
    const tokens = normalizedBrandName(restaurantName).split(" ").filter((token) => token.length >= 3 && !/^(bar|cafe|food|grill|burger|restaurant)$/.test(token));
    return tokens.some((token) => host.includes(token)) ? url.toString() : "";
  } catch {
    return "";
  }
}

function parseRestaurants(parsed: { l?: unknown; locationLabel?: unknown; p?: unknown; places?: unknown; restaurants?: unknown; results?: unknown }, input: DiscoveryInput) {
  const grouped = new Map<string, AiDiscoveredRestaurant>();
  const places = Array.isArray(parsed.p)
    ? parsed.p
    : Array.isArray(parsed.places)
      ? parsed.places
      : Array.isArray(parsed.restaurants)
        ? parsed.restaurants
        : Array.isArray(parsed.results)
          ? parsed.results
          : [];
  for (const rawPlace of places.slice(0, 8)) {
    if (!rawPlace) continue;
    const place = typeof rawPlace === "string" ? { n: rawPlace } : typeof rawPlace === "object" ? rawPlace as Record<string, unknown> : null;
    if (!place) continue;
    const name = cleanText(field(place, "n", "name", "restaurantName"), 160);
    const label = cleanText(field(place, "b", "branch", "branchLabel"), 120) || "Local branch";
    const address = cleanText(field(place, "a", "address"), 300) || `${input.location} · confirm exact branch`;
    if (!name) continue;
    const evidenceSummary = cleanText(field(place, "e", "evidenceSummary"), 360)
      || `Selected by the restaurant search model for ${input.food || "food"} with the requested allergy filters; confirm ingredients and cross-contact directly.`;
    const popularitySummary = cleanText(field(place, "q", "popularitySummary"), 180)
      || "Selected for local restaurant relevance and public prominence signals.";
    const rankingReason = cleanText(field(place, "r", "rankingReason"), 180)
      || "Ranked by allergy fit, requested food relevance, and local popularity.";
    const popularityTier = rankingTier(field(place, "pt", "popularityTier"));
    const allergyConfidenceTier = rankingTier(field(place, "at", "allergyConfidenceTier"));
    const foodRelevanceTier = rankingTier(field(place, "ft", "foodRelevanceTier"));

    const combinedAssessment = `${name} ${label} ${address} ${evidenceSummary} ${popularitySummary} ${rankingReason}`.toLowerCase();
    const isNonRestaurantVenue = /\b(market|food hall|food court|street food|stalls?|vendors?|various restaurants|restaurant collection)\b/.test(name.toLowerCase());
    const isUncertainFiller = /\b(tentative|verify current status|uncertain current operations|specific vendor availability varies|exact location.{0,30}(unknown|uncertain|unconfirmed)|may offer|might offer|could offer)\b/.test(combinedAssessment);
    if (isNonRestaurantVenue || isUncertainFiller) continue;

    const supportedAllergies = requestedAllergies(field(place, "sa", "supportedAllergies"), input.allergies);
    const explicitMissing = requestedAllergies(field(place, "ma", "missingAllergies"), input.allergies);
    const missingAllergies = input.allergies.filter((allergy) => explicitMissing.some((item) => item.toLowerCase() === allergy.toLowerCase())
      || !supportedAllergies.some((item) => item.toLowerCase() === allergy.toLowerCase()));
    const cuisineInput = field<unknown[]>(place, "c", "cuisine", "cuisines");
    const cuisine = Array.isArray(cuisineInput)
      ? cuisineInput.slice(0, 6).map((item) => cleanText(item, 80)).filter(Boolean)
      : [];
    const mapFallback = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${name} ${address}`)}`;
    const website = plausibleRestaurantUrl(field(place, "w", "website"), name) || mapFallback;
    const menuSourceUrl = plausibleRestaurantUrl(field(place, "m", "menuSourceUrl"), name) || website;
    const key = normalizedBrandName(name);
    if (!key) continue;
    const location = { label, address, website, sourceUrl: mapFallback };
    const existing = grouped.get(key);
    if (existing) {
      if (!existing.locations.some((item) => normalizedName(item.address) === normalizedName(address))) existing.locations.push(location);
      existing.cuisine = [...new Set([...existing.cuisine, ...cuisine])].slice(0, 6);
      existing.popularityTier = Math.max(existing.popularityTier || 3, popularityTier);
      existing.allergyConfidenceTier = Math.max(existing.allergyConfidenceTier || 3, allergyConfidenceTier);
      existing.foodRelevanceTier = Math.max(existing.foodRelevanceTier || 3, foodRelevanceTier);
      continue;
    }
    grouped.set(key, {
      name: key.length <= 5 ? key.toUpperCase() : name,
      cuisine,
      website,
      menuSourceUrl,
      qualitySourceUrl: website,
      evidenceSummary: `${evidenceSummary} Confirm ingredients and cross-contact directly with the restaurant.`,
      popularitySummary,
      rankingReason,
      supportedAllergies,
      missingAllergies,
      locations: [location],
      popularityTier,
      allergyConfidenceTier,
      foodRelevanceTier,
    });
  }
  return [...grouped.values()].sort((a, b) =>
    (b.popularityTier || 0) - (a.popularityTier || 0)
    || (b.allergyConfidenceTier || 0) - (a.allergyConfidenceTier || 0)
    || (b.foodRelevanceTier || 0) - (a.foodRelevanceTier || 0));
}

export async function discoverRestaurantsWithOpenRouter(input: DiscoveryInput) {
  const openRouterKey = (process.env.OPENROUTER_API_KEY || "").trim();
  const configuredNvidiaKey = (process.env.NVIDIA_API_KEY || "").trim();
  const nvidiaKey = configuredNvidiaKey.startsWith("sk-or-v1-") ? "" : configuredNvidiaKey;
  const openRouterModel = process.env.OPENROUTER_DISCOVERY_MODEL?.trim()
    || process.env.OPENROUTER_MODEL?.trim()
    || "nvidia/nemotron-3.5-lightning:free";
  if (!openRouterKey && configuredNvidiaKey.startsWith("sk-or-v1-")) {
    console.error("Free search configuration: the OpenRouter-formatted key is stored as NVIDIA_API_KEY. Move it to OPENROUTER_API_KEY.");
  }
  const providers = [
    ...(openRouterKey.startsWith("sk-or-v1-") ? [
      {
        name: "OpenRouter",
        apiKey: openRouterKey,
        endpoint: "https://openrouter.ai/api/v1/chat/completions",
        model: openRouterModel,
        openRouter: true,
        timeoutMs: 24000,
      },
      ...(openRouterModel === "openrouter/free" ? [] : [{
        name: "OpenRouter fallback",
        apiKey: openRouterKey,
        endpoint: "https://openrouter.ai/api/v1/chat/completions",
        model: "openrouter/free",
        openRouter: true,
        timeoutMs: 12000,
      }]),
    ] : []),
    ...(nvidiaKey ? [{
      name: "NVIDIA",
      apiKey: nvidiaKey,
      endpoint: "https://integrate.api.nvidia.com/v1/chat/completions",
      model: process.env.NVIDIA_DISCOVERY_MODEL?.trim() || "nvidia/nemotron-3.5-lightning-30b-a3b",
      openRouter: false,
      timeoutMs: 60000,
    }] : []),
  ];
  if (!providers.length) return { locationLabel: input.location || "your location", restaurants: [] as AiDiscoveredRestaurant[], status: "skipped" as const };

  const messages = [
    {
      role: "system",
      content: "Exactly 5 real open restaurants; rank popularity>food>allergy. No markets/fake URL/rating. GF burger needs GF bun/burger or GF venue, not bunless. Every requested allergen in sa or ma; unsure=ma. JSON object only: l=location,p=array. Each p item: n=name,b=branch,a=full address,c=cuisines,w=official site,e=allergy evidence,q=popularity evidence,r=rank reason,sa=supported requested allergens,ma=missing/uncertain,pt/at/ft=3-5 popularity/allergy/food. Keep e/q/r under 80 characters.",
    },
    {
      role: "user",
      content: JSON.stringify({
        loc: cleanText(input.location, 240),
        food: cleanText(input.food, 100) || "any",
        alg: input.allergies.slice(0, 10),
      }),
    },
  ];
  const allergyNames = input.allergies.slice(0, 10);
  const restaurantTool = {
    type: "function",
    function: {
      name: "submit_restaurants",
      description: "Return exactly five real, open, ranked restaurants for the requested search.",
      parameters: {
        type: "object",
        properties: {
          l: { type: "string", description: "Resolved city/location label." },
          p: {
            type: "array",
            minItems: 5,
            maxItems: 5,
            items: {
              type: "object",
              properties: {
                n: { type: "string", description: "Restaurant name only." },
                b: { type: "string", description: "Branch or neighbourhood label." },
                a: { type: "string", description: "Full street address." },
                c: { type: "array", items: { type: "string" }, description: "Cuisine and food tags." },
                w: { type: "string", description: "Official restaurant website URL, or empty string." },
                e: { type: "string", description: "Allergy/menu evidence in under 80 characters; never an email or phone." },
                q: { type: "string", description: "Popularity evidence in under 80 characters; never an email or phone." },
                r: { type: "string", description: "Short ranking reason covering popularity, food, and allergy fit." },
                sa: { type: "array", items: allergyNames.length ? { type: "string", enum: allergyNames } : { type: "string" }, description: "Supported requested allergy names, exact spelling." },
                ma: { type: "array", items: allergyNames.length ? { type: "string", enum: allergyNames } : { type: "string" }, description: "Missing or uncertain requested allergy names, exact spelling." },
                pt: { type: "integer", minimum: 3, maximum: 5, description: "Popularity tier." },
                at: { type: "integer", minimum: 3, maximum: 5, description: "Allergy-confidence tier." },
                ft: { type: "integer", minimum: 3, maximum: 5, description: "Food-relevance tier." },
              },
              required: ["n", "b", "a", "c", "w", "e", "q", "r", "sa", "ma", "pt", "at", "ft"],
            },
          },
        },
        required: ["l", "p"],
      },
    },
  };

  let lastStatus = 0;
  for (const provider of providers) {
    const collected = new Map<string, AiDiscoveredRestaurant>();
    try {
      const response = await fetch(provider.endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${provider.apiKey}`,
          "Content-Type": "application/json",
          ...(provider.openRouter ? {
            "HTTP-Referer": process.env.BETTER_AUTH_URL?.trim() || "http://localhost:3000",
            "X-Title": "Gluten FreEat",
          } : {}),
        },
        body: JSON.stringify({
          model: provider.model,
          messages,
          temperature: 0,
          max_tokens: 1100,
          stream: false,
          ...(provider.openRouter ? {
            reasoning: { effort: "none", exclude: true },
            include_reasoning: false,
            tools: [restaurantTool],
            tool_choice: { type: "function", function: { name: "submit_restaurants" } },
          } : {}),
        }),
        signal: AbortSignal.timeout(provider.timeoutMs),
      });
      lastStatus = response.status;
      if (!response.ok) {
        console.error(`${provider.name} restaurant discovery failed`, response.status, (await response.text()).slice(0, 500));
        continue;
      }
      const data = await response.json() as ChatCompletionResponse;
      const responseMessage = data.choices?.[0]?.message;
      const toolArguments = responseMessage?.tool_calls?.find((call) => call.function?.name === "submit_restaurants")?.function?.arguments;
      const responseContent = cleanText(toolArguments, 100000) || contentText(responseMessage?.content);
      const parsed = parseJsonObject(responseContent);
      const restaurants = parseRestaurants(parsed, input);
      for (const restaurant of restaurants) {
        const key = normalizedBrandName(restaurant.name);
        if (key && !collected.has(key)) collected.set(key, restaurant);
      }
      if (collected.size) {
        return { locationLabel: cleanText(parsed.l ?? parsed.locationLabel, 240) || input.location || "your location", restaurants: [...collected.values()].slice(0, 5), status: "used" as const };
      }
      console.error(`${provider.name} restaurant discovery returned no readable restaurants with ${provider.model}`);
    } catch (error) {
      console.error(`${provider.name} restaurant discovery failed with ${provider.model}`, error);
    }
  }
  return { locationLabel: input.location || "your location", restaurants: [] as AiDiscoveredRestaurant[], status: lastStatus === 429 ? "quota" as const : "unavailable" as const };
}
