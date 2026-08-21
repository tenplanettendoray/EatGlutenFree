export type NvidiaRestaurantLead = {
  name: string;
  website: string;
  rating: number | null;
  reviewCount: number | null;
  popularitySummary: string;
  rankingReason: string;
  qualitySourceUrl: string;
  sourceUrls: string[];
  rank: number;
};

export type WeightedPreferenceSignal = {
  name: string;
  suggestionWeight: number;
  avoidWeight: number;
  locationScope: string;
  allergyScope: string;
  foodScope: string;
};

type DiscoveryInput = {
  location: string;
  food: string;
  occasion: string;
  priceRange?: string;
  allergies: string[];
  suggestedRestaurant?: string;
  suggestedRestaurants?: string[];
  avoidedRestaurants?: string[];
  preferenceSignals?: WeightedPreferenceSignal[];
};

type NvidiaDiscoveryResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
};

function publicUrl(value: unknown) {
  if (typeof value !== "string") return "";
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol)) return "";
    return url.toString();
  } catch {
    return "";
  }
}

function parseJsonObject(content: string) {
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const source = fenced || content;
  const start = source.indexOf("{");
  const end = source.lastIndexOf("}");
  if (start < 0 || end <= start) return {};
  return JSON.parse(source.slice(start, end + 1)) as { restaurants?: unknown };
}

export async function discoverRestaurantLeadsWithNvidia(input: DiscoveryInput) {
  const apiKey = (process.env.OPENROUTER_API_KEY || process.env.NVIDIA_API_KEY || "").trim();
  if (!apiKey) return { leads: [] as NvidiaRestaurantLead[], status: "skipped" as const, source: "none" as const };
  const usesOpenRouter = apiKey.startsWith("sk-or-v1-") || Boolean(process.env.OPENROUTER_API_KEY?.trim());
  const endpoint = usesOpenRouter
    ? "https://openrouter.ai/api/v1/chat/completions"
    : "https://integrate.api.nvidia.com/v1/chat/completions";
  const model = usesOpenRouter
    ? process.env.OPENROUTER_DISCOVERY_MODEL?.trim() || process.env.OPENROUTER_MODEL?.trim() || "openrouter/free"
    : process.env.NVIDIA_DISCOVERY_MODEL?.trim() || "nvidia/llama-3.3-nemotron-super-49b-v1.5";
  const providerLabel = usesOpenRouter ? "OpenRouter" : "NVIDIA";

  try {
    const messages = [
      {
        role: "system",
        content: [
          "You are a restaurant discovery agent for Safe Serve.",
          "Find 8 to 12 real, currently operating restaurants that best fit the request.",
          "Rank primarily by trustworthy current rating, number of reviews, broad popularity, requested-food relevance, and local reputation.",
          "Allergy accommodation is an eligibility lead, never a safety guarantee: prefer official restaurant menu or allergen pages and do not claim ingredients or cross-contact safety.",
          "Avoid weak, obscure, poorly reviewed, closed, or irrelevant businesses when better popular choices exist.",
          "For chains, return the brand once; the application groups its locations.",
          "If users suggest restaurants, include them only when they are real, locally relevant, food-relevant, and have enough evidence for the request.",
          "If users mark restaurants to avoid, do not recommend those restaurants unless there are no viable alternatives; if included, rank them last and explain why.",
          "The user message includes publicPreferenceSignals from Safe Serve's database. suggestionWeight is the number of matching positive votes and avoidWeight is the number of matching negative votes.",
          "Use the weights as a medium-strength ranking signal after location, requested food, and complete allergy relevance. Never let votes make an allergy-incompatible restaurant eligible.",
          "Apply a preference signal only when its locationScope, allergyScope, and foodScope are relevant to the current request. Do not treat votes from a different location or allergy as relevant.",
          "Never invent a rating, review count, website, or source. Use null when a numeric value is not supported.",
          "Return JSON only as {\"restaurants\":[{\"name\":\"\",\"website\":\"\",\"rating\":null,\"reviewCount\":null,\"popularitySummary\":\"\",\"rankingReason\":\"\",\"qualitySourceUrl\":\"\",\"sourceUrls\":[\"\"]}]}.",
        ].join(" "),
      },
      {
        role: "user",
        content: JSON.stringify({
          location: input.location,
          meal: input.occasion || "any meal",
          food: input.food || "any food",
          priceRange: input.priceRange || "any price",
          allergies: input.allergies,
          suggestedRestaurants: input.suggestedRestaurants?.length ? input.suggestedRestaurants : input.suggestedRestaurant ? [input.suggestedRestaurant] : [],
          avoidedRestaurants: input.avoidedRestaurants || [],
          publicPreferenceSignals: input.preferenceSignals || [],
          instruction: "Put the strongest popular matches first. Be conservative: cite sources you already know, and use null for unsupported popularity numbers.",
        }),
      },
    ];

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        ...(usesOpenRouter ? { "HTTP-Referer": "http://localhost:3000", "X-Title": "Safe Serve" } : {}),
      },
      body: JSON.stringify({
        model,
        messages,
        response_format: { type: "json_object" },
        temperature: 0.1,
        max_tokens: 3500,
      }),
      signal: AbortSignal.timeout(45000),
    });

    if (!response.ok) {
      console.error(`${providerLabel} restaurant discovery failed`, response.status, (await response.text()).slice(0, 500));
      return { leads: [] as NvidiaRestaurantLead[], status: response.status === 429 ? "quota" as const : "unavailable" as const, source: "none" as const };
    }

    const data = await response.json() as NvidiaDiscoveryResponse;
    const parsed = parseJsonObject(data.choices?.[0]?.message?.content || "{}");
    if (!Array.isArray(parsed.restaurants)) return { leads: [] as NvidiaRestaurantLead[], status: "unavailable" as const, source: "none" as const };

    const leads = parsed.restaurants.slice(0, 12).flatMap((raw, index) => {
      if (!raw || typeof raw !== "object") return [];
      const item = raw as Record<string, unknown>;
      const name = typeof item.name === "string" ? item.name.trim() : "";
      if (!name) return [];
      const claimedSources = Array.isArray(item.sourceUrls) ? item.sourceUrls.map(publicUrl).filter(Boolean) : [];
      const qualitySourceUrl = publicUrl(item.qualitySourceUrl);
      const sourceUrls = [...new Set([...claimedSources, qualitySourceUrl].filter(Boolean))];
      const rating = typeof item.rating === "number" && item.rating >= 0 && item.rating <= 5 ? item.rating : null;
      const reviewCount = typeof item.reviewCount === "number" && item.reviewCount >= 0 ? Math.round(item.reviewCount) : null;
      return [{
        name,
        website: publicUrl(item.website),
        rating,
        reviewCount,
        popularitySummary: typeof item.popularitySummary === "string" ? item.popularitySummary.slice(0, 500) : `${providerLabel} model discovery match; check linked sources for current details.`,
        rankingReason: typeof item.rankingReason === "string" ? item.rankingReason.slice(0, 500) : `${providerLabel} ranked this among the strongest matches for the request.`,
        qualitySourceUrl: sourceUrls[0] || "",
        sourceUrls,
        rank: index + 1,
      } satisfies NvidiaRestaurantLead];
    });

    return { leads, status: leads.length ? "used" as const : "unavailable" as const, source: leads.length ? "model" as const : "none" as const };
  } catch (error) {
    console.error(`${providerLabel} restaurant discovery error`, error);
    return { leads: [] as NvidiaRestaurantLead[], status: "unavailable" as const, source: "none" as const };
  }
}
