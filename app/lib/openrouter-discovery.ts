import type { AiDiscoveredRestaurant } from "./ai-discovery";
import { isPlausibleRestaurantName } from "./restaurant-result-validation";
import { normalize, officialUrl } from "./public-web";
import { reviewedCandidates, verifyRestaurantCandidate, type EvidenceInput, type RestaurantCandidate } from "./restaurant-evidence";

const cooldowns = new Map<string, number>();
type Completion = { model?: string; choices?: Array<{ finish_reason?: string; message?: { content?: string | null } }> };
const prompt = 'Identify up to 8 established restaurant businesses in the requested city, prioritizing specialists in the requested dish known for accommodating the dietary request. Return only JSON {"p":[{"n":"business name","w":"official website","m":"menu or FAQ URL if known"}]}. Use correct official domains. Do not invent domains or businesses. Do not return foods, allergens, directories, or chains absent from the city. Fewer entries is fine. Rank likely relevant local favorites first. For gluten-free burgers, seek actual gluten-free buns, not lettuce wraps. No safety claims or explanations.';

export function parseCandidates(content: string, input: EvidenceInput): RestaurantCandidate[] {
  try {
    const source = content.replace(/^\s*```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "");
    const object = JSON.parse(source.slice(source.indexOf("{"), source.lastIndexOf("}") + 1));
    if (!Array.isArray(object.p)) return [];
    const seen = new Set<string>();
    return object.p.slice(0, 8).flatMap((item: unknown) => {
      if (!item || typeof item !== "object") return [];
      const p = item as Record<string, unknown>;
      const n = typeof p.n === "string" ? p.n.trim().slice(0, 160) : "";
      const w = officialUrl(p.w);
      const key = normalize(n);
      if (!w || !isPlausibleRestaurantName(n, input.food, input.allergies) || seen.has(key)) return [];
      seen.add(key);
      return [{ n, w, m: officialUrl(p.m) || undefined }];
    });
  } catch { return []; }
}

export async function discoverRestaurantsWithOpenRouter(input: EvidenceInput) {
  const routerKey = process.env.OPENROUTER_API_KEY?.trim();
  const nvidiaKey = process.env.NVIDIA_API_KEY?.trim();
  const providers = [
    ...(routerKey ? [{ name: "OpenRouter", key: routerKey, endpoint: "https://openrouter.ai/api/v1/chat/completions", model: process.env.OPENROUTER_DISCOVERY_MODEL?.trim() || process.env.OPENROUTER_MODEL?.trim() || "nex-agi/nex-n2.5-pro:free" }] : []),
    ...(nvidiaKey && !nvidiaKey.startsWith("sk-or-") ? [{ name: "NVIDIA", key: nvidiaKey, endpoint: "https://integrate.api.nvidia.com/v1/chat/completions", model: process.env.NVIDIA_DISCOVERY_MODEL?.trim() || "nvidia/nemotron-3.5-lightning-30b-a3b" }] : []),
  ];
  const failures: string[] = [];
  const hints = reviewedCandidates(input);
  const checks = new Map<string, ReturnType<typeof verifyRestaurantCandidate>>();
  const rejected = new Map<string, number>();
  const verify = async (candidates: RestaurantCandidate[]) => {
    const byName = new Map(candidates.map(candidate => [normalize(candidate.n), candidate]));
    for (const hint of hints) byName.set(normalize(hint.n), hint);
    const verified = await Promise.all([...byName.values()].slice(0, 10).map(candidate => {
      const key = candidate.w + "|" + candidate.n;
      if (!checks.has(key)) checks.set(key, verifyRestaurantCandidate(candidate, input, undefined, reason => rejected.set(reason, (rejected.get(reason) || 0) + 1)));
      return checks.get(key)!;
    }));
    return verified.filter((result): result is AiDiscoveredRestaurant => Boolean(result))
      .sort((a, b) => a.missingAllergies.length - b.missingAllergies.length).slice(0, 5);
  };
  for (const provider of providers) {
    const id = provider.name + ":" + provider.model;
    if ((cooldowns.get(id) || 0) > Date.now()) { failures.push(`${provider.name} is cooling down after a recent provider error.`); continue; }
    try {
      const response = await fetch(provider.endpoint, {
        method: "POST",
        headers: { Authorization: `Bearer ${provider.key}`, "Content-Type": "application/json", ...(provider.name === "OpenRouter" ? { "X-Title": "Gluten FreEat" } : {}) },
        body: JSON.stringify({ model: provider.model, messages: [{ role: "system", content: prompt }, { role: "user", content: JSON.stringify({ location: input.location.slice(0, 240), food: input.food.slice(0, 100), allergies: input.allergies.slice(0, 10) }) }], max_tokens: 1800, temperature: 0, stream: false, ...(provider.name === "OpenRouter" ? { reasoning: { enabled: false } } : { chat_template_kwargs: { enable_thinking: false } }) }),
        signal: AbortSignal.timeout(20000),
      });
      if (!response.ok) {
        await response.body?.cancel();
        const reason = response.status === 429 ? "rate limit reached" : response.status === 401 || response.status === 403 ? "API key rejected" : `request failed (HTTP ${response.status})`;
        failures.push(`${provider.name}: ${reason}.`);
        if ([401, 403, 429, 503].includes(response.status)) cooldowns.set(id, Date.now() + 60000);
        continue;
      }
      const data = await response.json() as Completion;
      const choice = data.choices?.[0];
      if (choice?.finish_reason === "length") { failures.push(`${provider.name}: incomplete response.`); continue; }
      const candidates = parseCandidates(choice?.message?.content || "", input);
      if (!candidates.length) { failures.push(`${provider.name}: no usable restaurant names and official websites returned.`); continue; }
      const restaurants = await verify(candidates);
      if (restaurants.length) return { locationLabel: input.location, restaurants, status: "used" as const, provider: provider.name, model: data.model || provider.model };
      failures.push(`${provider.name}: restaurant websites could not confirm the requested city and food.`);
    } catch (error) {
      failures.push(`${provider.name}: ${error instanceof Error && /timeout|abort/i.test(error.name) ? "request timed out" : "connection failed"}.`);
    }
  }
  if (hints.length) {
    const restaurants = await verify([]);
    if (restaurants.length) return { locationLabel: input.location, restaurants, status: "used" as const, provider: "Official restaurant sources", model: undefined, warning: failures.join(" ") || "AI search is not configured." };
  }
  const details = [...rejected].map(([reason, count]) => `${count} ${reason}`).join("; ");
  return { locationLabel: input.location, restaurants: [] as AiDiscoveredRestaurant[], status: providers.length ? "unavailable" as const : "skipped" as const, failureReason: (failures.join(" ") || "No restaurant AI provider is configured. Add OPENROUTER_API_KEY in the site settings.") + (details ? ` Verification details: ${details}.` : "") };
}
