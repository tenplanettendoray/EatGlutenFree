import { boundedText, normalize, officialUrl, fetchPublicPage, htmlText } from "./public-web";
import type { AiDiscoveredRestaurant } from "./ai-discovery";

export type RestaurantSource = { id: number; url: string; title: string; text: string };
export type RestaurantQuery = { location: string; food: string; allergies: string[] };

function cityAliases(location: string) {
  const city = normalize(location.split(",")[0]);
  const aliases: Record<string, string[]> = {
    rome: ["roma"], lisbon: ["lisboa"], florence: ["firenze"], munich: ["munchen"],
    vienna: ["wien"], prague: ["praha"], venice: ["venezia"], newyork: ["nyc"],
    "new york": ["nyc", "manhattan", "brooklyn"],
  };
  return [city, ...(aliases[city] || [])].filter(Boolean);
}

export function mentionsCity(text: string, location: string) {
  const haystack = ` ${normalize(text)} `;
  return cityAliases(location).some(city => haystack.includes(` ${city} `));
}

export function mentionsDish(text: string, food: string) {
  const requested = normalize(food);
  if (!requested || requested === "any") return true;
  const words = requested.split(" ").filter(word => word.length > 2);
  const haystack = normalize(text);
  if (/burger/.test(requested)) return /burger|hamburguer|hamburger/.test(haystack);
  if (/pizza/.test(requested)) return /pizza|pizze|pizzeria/.test(haystack);
  if (/ramen/.test(requested)) return /ramen|ラーメン/.test(haystack);
  return words.some(word => haystack.includes(word));
}

function compactSource(title: string, content: string, input: RestaurantQuery) {
  // Preserve actual excerpts, not generated summaries. Retain food, location,
  // allergy and address passages while bounding the ranking model's input.
  const text = content.replace(/\s+/g, " ").trim();
  if (text.length <= 2100) return text;
  const words = [input.food, ...input.allergies, ...cityAliases(input.location), "sans gluten", "senza glutine", "sem gluten", "menu", "address"]
    .map(normalize).filter(Boolean);
  const chunks = text.match(/.{1,280}(?:\s|$)/g) || [];
  const ranked = chunks.map((chunk, index) => ({ chunk, index, score: words.reduce((score, word) => score + Number(normalize(chunk).includes(word)), 0) }));
  const selected = ranked.sort((a, b) => b.score - a.score || a.index - b.index).slice(0, 6).sort((a, b) => a.index - b.index);
  return `${title}. ${selected.map(item => item.chunk).join(" … ")}`.slice(0, 2100);
}

export function sourcesFromAnnotations(annotations: unknown, input: RestaurantQuery): RestaurantSource[] {
  if (!Array.isArray(annotations)) return [];
  const sources: RestaurantSource[] = [];
  const seen = new Set<string>();
  for (const item of annotations.slice(0, 12)) {
    const citation = item?.url_citation;
    if (!citation || typeof citation.title !== "string" || typeof citation.content !== "string") continue;
    const url = officialUrl(citation.url);
    if (!url || seen.has(url) || /findmeglutenfree|glutenlibre|wanderlust|reddit|timeout|tripadvisor|visitcity|happycow|yelp|restaurantguru|gluten\.guide|lacarte\.menu|menuweb|restaurantji|foursquare|opentable|trip\.com|eater\.com|mapstr|ineews|wheree|menu-world|res-menu|\.shop$/i.test(new URL(url).hostname)) continue;
    const text = `${citation.title} ${citation.content}`;
    if (!mentionsCity(text, input.location) || !mentionsDish(text, input.food)) continue;
    if (/permanently closed|closed permanently|domain for sale/i.test(text)) continue;
    seen.add(url);
    sources.push({ id: sources.length + 1, url, title: citation.title.slice(0, 200), text: compactSource(citation.title, citation.content, input) });
  }
  return sources.slice(0, 10);
}

export function sourcesFromGroqTools(tools: unknown, input: RestaurantQuery) {
  if (!Array.isArray(tools)) return [];
  const candidates: Array<{ url: string; title: string; text: string }> = [];
  const seen = new Set<string>();
  for (const tool of tools) {
    const output = tool && typeof tool === "object" && typeof (tool as { output?: unknown }).output === "string" ? (tool as { output: string }).output : "";
    const entries = [...output.matchAll(/(?:^|\n)Title:\s*([^\n]+)\nURL:\s*(https?:\/\/[^\s]+)\nContent:\s*([\s\S]*?)(?=\nTitle:|$)/gi)];
    for (const match of entries) {
      const url = officialUrl(match[2]);
      if (!url || seen.has(url)) continue;
      const host = new URL(url).hostname;
      if (/findmeglutenfree|glutenlibre|wanderlust|reddit|tripadvisor|happycow|yelp|restaurantguru|gluten\.guide|lacarte\.menu|menuweb|restaurantji|foursquare|opentable|trip\.com|eater\.(?:com|space)|mapstr|menu-world|res-menu|timeout|wheree|ineews|visitcity|atly|glutoapp|gf-explorer|thatsup|spokin|allergycompanion|webzine|foodcompass|vegewel|japan-glutenfree|gluten-free-japan|abroad|tripaligner|travelpal/i.test(host)) continue;
      const title = htmlText(match[1]);
      const text = htmlText(`${match[1]} ${match[3]}`);
      if (!mentionsCity(text, input.location) || !mentionsDish(text, input.food)) continue;
      seen.add(url);
      candidates.push({ url, title, text });
    }
  }
  return candidates.slice(0, 12);
}

export function sourceRestaurantName(source: RestaurantSource) {
  const label = new URL(source.url).hostname.replace(/^www\./, "").split(".")[0];
  const domain = normalize(label).replace(/ /g, "");
  const segments = source.title.split(/\s*(?:\||｜|–|—| - |:)\s*/).map(part => part.replace(/\s+/g, " ").trim()).filter(Boolean);
  let best = "", bestScore = 0;
  for (const segment of segments) {
    const words = normalize(segment).split(" ").filter(word => word.length >= 3 && !/^(home|menu|official|restaurant|restaurants|pizza|pizzeria|gluten|free|london|paris|rome|madrid|lisbon|tokyo|berlin)$/.test(word));
    const score = words.reduce((total, word) => total + (domain.includes(word) ? word.length : 0), 0);
    if (score > bestScore) { best = segment; bestScore = score; }
  }
  if (bestScore >= 4) return best.replace(/\s+[|–—-].*$/, "").trim().slice(0, 120);
  const slugName = label.split(/[-_]/).filter(word => word.length >= 3 && !/^(gluten|glutenfree|free|restaurant|restaurants|official|tokyo|london|paris|rome|madrid|lisbon|berlin)$/.test(word)).join(" ");
  return slugName ? slugName.replace(/\b\w/g, character => character.toUpperCase()).slice(0, 120) : "";
}

async function publicSearchSources(input: RestaurantQuery): Promise<RestaurantSource[]> {
  const key = process.env.GROQ_API_KEY?.trim();
  if (!key) return [];
  const dietary = input.allergies.map(name => /^(gluten|gf)$/i.test(name) ? "gluten-free" : `${name}-free`).join(", ");
  let candidates: Array<{ url: string; title: string; text: string }> = [];
  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "Groq-Model-Version": "2025-07-23" },
      body: JSON.stringify({
        model: "groq/compound-mini",
        messages: [{ role: "user", content: `Find current official restaurant websites or official menu pages for ${input.food.slice(0, 100) || "food"} in ${input.location.slice(0, 240)}. Search for explicit ${dietary || "allergen"} menu evidence. Partial allergy matches are useful; unknown remains unknown. Return a concise list of restaurant names and official URLs. Exclude directories, review sites, delivery services and travel blogs.` }],
      }),
      signal: AbortSignal.timeout(18000),
    });
    if (!response.ok) { console.warn("Restaurant web research failed", response.status); await response.body?.cancel(); return []; }
    const data = JSON.parse(await boundedText(response, 500000));
    candidates = sourcesFromGroqTools(data.choices?.[0]?.message?.executed_tools, input);
  } catch { return []; }
  const checked = await Promise.all(candidates.slice(0, 14).map(async source => {
    const page = await fetchPublicPage(source.url);
    if (!page) return null;
    const pageTitle = htmlText(page.html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "");
    const title = pageTitle || source.title;
    const text = htmlText(page.html.replace(/<img\b[^>]*\balt=["']([^"']*)["'][^>]*>/gi, " $1 "));
    const combined = `${source.title} ${source.text} ${title} ${text}`;
    if (/\bfood delivery\b/i.test(title) || /\/delivery(?:[/?#]|$)/i.test(page.url)) return null;
    if (!mentionsCity(combined, input.location) || !mentionsDish(combined, input.food)) return null;
    return { id: 0, url: page.url, title: title.slice(0, 200), text: compactSource(title, combined, input) };
  }));
  const unique = new Map<string, RestaurantSource>();
  for (const source of checked) {
    if (!source) continue;
    const host = new URL(source.url).hostname.replace(/^www\./, "");
    if (!unique.has(host)) unique.set(host, source);
  }
  return [...unique.values()].slice(0, 8).map((source, index) => ({ ...source, id: index + 1 }));
}

export async function findRestaurantSources(input: RestaurantQuery): Promise<RestaurantSource[]> {
  return publicSearchSources(input);
}

function exactQuote(value: unknown, source: RestaurantSource) {
  if (typeof value !== "string" || value.trim().length < 8 || value.length > 350) return "";
  const quote = value.trim();
  return normalize(source.text).includes(normalize(quote)) ? quote : "";
}

function allergyQuoteMatches(name: string, quote: string, food: string) {
  const text = normalize(quote);
  if (/\b(not|no|cannot) (?:offer|provide|guarantee)|not gluten free|contains gluten|may contain|非対応|小麦.{0,20}含/.test(text)) return false;
  if (/^(gluten|gf)$/i.test(name)) {
    if (!/gluten free|sans gluten|senza glutine|sem gluten|sin gluten|グルテンフリー/.test(text)) return false;
    const dedicated = /100|entire menu|all (?:our |the )?(?:menu|food|dishes)|tutto il menu|dedicated|entierement|tout.*sans gluten|restaurant gluten free/.test(text);
    if (/burger/i.test(food) && !dedicated && !/(?:gluten free|sans gluten|senza glutine).{0,80}(?:bun|burger)|(?:bun|burger).{0,80}(?:gluten free|sans gluten|senza glutine)/.test(text)) return false;
    if (/pizza/i.test(food) && !dedicated && !/(?:gluten free|sans gluten|senza glutine).{0,80}(?:pizza|pizze)|(?:pizza|pizze).{0,80}(?:gluten free|sans gluten|senza glutine)/.test(text)) return false;
    if (/ramen/i.test(food) && !dedicated && !/(?:gluten free|sans gluten) (?:(?:brown rice|rice|ramen) )?(?:ramen|noodles)|(?:ramen|noodles)(?: menu| option| base)? (?:is |are )?(?:gluten free|sans gluten)|グルテンフリー.{0,12}ラーメン|ラーメン.{0,12}グルテンフリー/.test(text)) return false;
    // A gluten-free salad on a pizzeria menu does not prove GF pizza.
    return mentionsDish(quote, food) || dedicated;
  }
  // Gluten-free is not evidence of wheat safety; vegan is not milk/egg safety.
  const allergen = normalize(name);
  return text.includes(`${allergen} free`) || text.includes(`free from ${allergen}`) || text.includes(`without ${allergen}`);
}

function sourceQuote(source: RestaurantSource, accepts: (quote: string) => boolean) {
  const chunks = source.text.split(/(?<=[.!?;])\s+|\s(?:…|\.\.\.)\s/);
  for (const chunk of chunks) {
    // Avoid customer-review prose when extracting advertised menu information.
    if (chunk.includes("|") || /\bi (?:had|ordered|visited)|\bwe (?:had|ordered|visited)|je recommande|j['’]y|recension|reviewed|\bstelle\b/i.test(chunk)) continue;
    if (chunk.length <= 250 && chunk.length >= 8 && accepts(chunk)) return chunk;
    for (let i = 0; i < chunk.length; i += 100) {
      const quote = chunk.slice(i, i + 250).replace(/^\S*\s/, "").replace(/\s\S*$/, "").trim();
      if (quote.length >= 8 && accepts(quote)) return quote;
    }
  }
  return "";
}

/** Source IDs and literal excerpts bind model claims to independently retrieved pages. */
export function groundRestaurants(parsed: unknown, input: RestaurantQuery, sources: RestaurantSource[]): AiDiscoveredRestaurant[] {
  if (!parsed || typeof parsed !== "object" || !Array.isArray((parsed as { p?: unknown }).p)) return [];
  const results: AiDiscoveredRestaurant[] = [];
  const seen = new Set<string>();
  for (const row of (parsed as { p: unknown[] }).p.slice(0, 8)) {
    if (!row || typeof row !== "object" || Array.isArray(row)) continue;
    const item = row as Record<string, unknown>;
    const source = sources.find(source => source.id === item.s);
    const rawName = typeof item.n === "string" ? item.n.trim().slice(0, 160) : "";
    const name = rawName.replace(/\s+-\s+[^-]*\d[^-]*$/, "").trim();
    if (!source || !name || input.allergies.some(allergy => normalize(allergy) === normalize(name))) continue;
    if (/\b(?:travel|trip|directory|guide|magazine|webzine|food blog|eater space)\b/i.test(name)) continue;
    // Parent hospitality groups and generic menu headings are not restaurants.
    if (/^(by ciro|restaurant group|our restaurants?|menus?)$/i.test(name)) continue;
    const tokens = normalize(name).split(" ").filter(word => !["restaurant", "pizzeria", "the", "le", "la", "de", "di", "da", "cafe"].includes(word));
    if (!tokens.length || !tokens.every(word => (` ${normalize(source.title + " " + source.text + " " + source.url)} `).includes(` ${word} `))) continue;
    // Directories often put a restaurant name in their path/subdomain. Require
    // a brand token in the site's own domain, not merely its search-page title.
    const domain = new URL(source.url).hostname.replace(/^www\./, "").replace(/\./g, "");
    if (!tokens.some(token => token.length >= 4 && normalize(domain).replace(/ /g, "").includes(token))) continue;
    const dishQuote = item.fq === undefined ? sourceQuote(source, quote => mentionsDish(quote, input.food)) : exactQuote(item.fq, source);
    if (!dishQuote || !mentionsDish(dishQuote, input.food)) continue;
    const key = normalize(name);
    const host = new URL(source.url).hostname.replace(/^www\./, "");
    if (seen.has(key) || seen.has(host)) continue;
    const supported: string[] = [];
    const evidence: string[] = [];
    for (const allergy of input.allergies) {
      const quote = sourceQuote(source, quote => allergyQuoteMatches(allergy, quote, input.food));
      if (quote && allergyQuoteMatches(allergy, quote, input.food)) { supported.push(allergy); evidence.push(`${allergy}: “${quote}”`); }
    }
    const missing = input.allergies.filter(allergy => !supported.includes(allergy));
    // A multi-allergen search can have useful partial matches, but a venue
    // without evidence for any requested restriction must not be called a match.
    if (input.allergies.length && !supported.length) continue;
    seen.add(key); seen.add(host);
    const statedAddress = typeof item.a === "string" ? item.a.trim().slice(0, 260) : "";
    const address = statedAddress.length >= 10 && /\d/.test(statedAddress) && normalize(source.text).includes(normalize(statedAddress))
      ? statedAddress : `${input.location} · confirm branch address`;
    const maps = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${name} ${input.location}`)}`;
    results.push({
      name, cuisine: [input.food].filter(Boolean), website: source.url, menuSourceUrl: source.url, qualitySourceUrl: source.url,
      evidenceSummary: `${evidence.join(" ").slice(0, 350)}${missing.length ? ` ${missing.join(", ")}: not confirmed.` : ""} Confirm ingredients and cross-contact with staff.`,
      popularitySummary: "Selected from restaurant-published menu information; public ratings were not verified.",
      rankingReason: `${supported.includes("Gluten") ? "Gluten-free " : ""}${input.food || "Food"} options listed on the menu.${missing.length ? ` ${missing.join(", ")} handling is unconfirmed.` : " Confirm preparation with staff."}`,
      supportedAllergies: supported, missingAllergies: missing,
      locations: [{ label: input.location.split(",")[0], address, website: source.url, sourceUrl: maps }],
      foodRelevanceTier: 5, allergyConfidenceTier: missing.length ? 3 : 4, popularityTier: 3,
    });
  }
  return results.sort((a, b) => a.missingAllergies.length - b.missingAllergies.length).slice(0, 5);
}
