import { fetchPublicPage, htmlText, normalize, officialUrl, publicUrl } from "./public-web";

export type SearchSource = { title: string; url: string; snippet: string; excerpt?: string; links?: Array<{ title: string; url: string }> };
let alternateSearchBlockedUntil = 0;

export function mentionsLocation(text: string, location: string) {
  const city = normalize(location);
  const aliases: Record<string, string[]> = { rome: ["roma"], "new york": ["new york city", "nyc", "manhattan", "brooklyn"], "new york city": ["new york", "nyc", "manhattan", "brooklyn"], lisbon: ["lisboa"], florence: ["firenze"], munich: ["munchen"], vienna: ["wien"] };
  const haystack = ` ${normalize(text)} `;
  return [city, ...(aliases[city] || [])].some(value => value && haystack.includes(` ${value} `));
}

export function relevantRestaurantSource(source: SearchSource, location: string) {
  const text = `${source.title} ${source.snippet} ${source.excerpt || ""}`;
  return mentionsLocation(text, location)
    && /\b(?:restaurants?|ristorant\w*|restaurante\w*|menus?|pizza|burgers?|caf[eé]|bistro|dining|bakery|pizzeria|trattoria|cuisine)\b/i.test(text);
}

export function sourceSupportsRestaurant(source: SearchSource, name: string, input: { location: string; food: string }) {
  if (!relevantRestaurantSource(source, input.location)) return false;
  const text = ` ${normalize(`${source.title} ${source.snippet} ${source.excerpt || ""}`)} `;
  const brand = normalize(name.split(/\s[-–—|]\s/)[0]).replace(/\b(restaurant|street food)\b/g, "").trim();
  const named = brand.length >= 2 && text.includes(` ${brand} `);
  const food = normalize(input.food).split(" ").filter(Boolean).map(word => word.replace(/s$/, ""));
  return named && (!food.length || food.some(word => text.includes(word)));
}

/** Public search is a discovery aid. A snippet is never proof of allergy safety. */
export function parseSearchSources(html: string): SearchSource[] {
  const sources: SearchSource[] = [];
  for (const item of html.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)) {
    const read = (tag: string) => htmlText((item[1].match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"))?.[1] || "").replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1"));
    const url = publicUrl(read("link"));
    if (url) sources.push({ url, title: read("title").slice(0, 180), snippet: read("description").slice(0, 650) });
  }
  for (const block of html.split(/class=["']result results_links/).slice(1)) {
    const anchor = block.match(/<a\b[^>]*class=["']result__a["'][^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i);
    if (!anchor) continue;
    try {
      const link = new URL(anchor[1].replace(/&amp;/g, "&"), "https://duckduckgo.com");
      const url = publicUrl(link.searchParams.get("uddg") || link.href);
      if (!url || /(^|\.)duckduckgo\.com$/.test(new URL(url).hostname)) continue;
      const snippet = block.match(/class=["']result__snippet["'][^>]*>([\s\S]*?)<\/(?:a|div|span)>/i)?.[1] || "";
      if (!sources.some(source => source.url === url)) sources.push({ url, title: htmlText(anchor[2]).slice(0, 180), snippet: htmlText(snippet).slice(0, 650) });
    } catch { /* malformed search result */ }
  }
  return sources.slice(0, 12);
}

export async function searchPublicSources(query: string): Promise<SearchSource[]> {
  const terms = [...new Set(normalize(query).split(" ").filter(word => word.length > 2 && !/^(best|official|website|site|menu|restaurants?|free|reviews?|ratings?|google|maps|the|and|local|near)$/.test(word)).map(word => word.replace(/s$/, "")))];
  const relevant = (source: SearchSource) => {
    const text = normalize(`${source.title} ${source.snippet}`);
    return terms.filter(term => text.includes(term)).length >= Math.min(2, terms.length);
  };
  const page = await fetchPublicPage(`https://www.bing.com/search?format=rss&q=${encodeURIComponent(query)}`, true);
  const sources = page ? parseSearchSources(page.html).filter(relevant) : [];
  if (sources.length >= 3) return sources;
  if (Date.now() < alternateSearchBlockedUntil) return sources;
  const fallback = await fetchPublicPage(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`);
  if (fallback && /bots use DuckDuckGo|anomaly-modal|challenge-form/i.test(fallback.html)) {
    alternateSearchBlockedUntil = Date.now() + 5 * 60_000;
    return sources;
  }
  return [...new Map([...sources, ...(fallback ? parseSearchSources(fallback.html).filter(relevant) : [])].map(source => [source.url, source])).values()].slice(0, 16);
}

export async function searchRestaurantSources(input: { location: string; food: string; allergies: string[] }) {
  const dietary = input.allergies.map(value => /^(gluten|gf)$/i.test(value) ? "gluten-free" : `${value}-free`).join(" ");
  const query = [input.location, dietary, input.food || "restaurants"].filter(Boolean).join(" ");
  try {
    const officialQuery = [input.location, dietary.replace(/gluten-free/g, '"gluten free"'), input.food, "restaurant official website"].filter(Boolean).join(" ");
    const localTerms = /\b(italy|rome|roma|milan|florence|naples)\b/i.test(input.location) ? 'ristorante "senza glutine"'
      : /\b(france|paris|lyon|nice)\b/i.test(input.location) ? 'restaurant "sans gluten"'
      : /\b(spain|madrid|barcelona)\b/i.test(input.location) ? 'restaurante "sin gluten"'
      : /\b(germany|berlin|munich)\b/i.test(input.location) ? 'Restaurant glutenfrei'
      : /\b(netherlands|amsterdam|rotterdam)\b/i.test(input.location) ? 'restaurant glutenvrij' : "";
    const queries = [...new Set([query, officialQuery,
      ...(localTerms && input.allergies.some(allergy => /^(gluten|gf)$/i.test(allergy)) ? [`${input.location} ${input.food} ${localTerms}`] : [])])];
    const pages = await Promise.allSettled(queries.map(q => searchPublicSources(q)));
    const batches = pages.map(result => result.status === "fulfilled" ? result.value : []);
    const sources = [...new Map(batches.flat().map(source => [source.url, source])).values()]
      .filter(source => relevantRestaurantSource(source, input.location))
      .sort((a, b) => Number(/guide|\bapp\b|best|top \d|travel/i.test(a.title)) - Number(/guide|\bapp\b|best|top \d|travel/i.test(b.title))).slice(0, 32);
    // Country guides often contain no restaurant names in their short search
    // snippets. Read a bounded sample, including real outbound business links.
    const detailUrls = batches.map(batch => batch[0]?.url);
    await Promise.allSettled(sources.filter(source => detailUrls.includes(source.url)).map(async source => {
      const detail = await fetchPublicPage(source.url);
      if (!detail) return;
      const content = (detail.html.match(/<(?:article|main)\b[^>]*>([\s\S]*?)<\/(?:article|main)>/i)?.[1] || detail.html)
        .replace(/<(?:nav|header|footer)\b[^>]*>[\s\S]*?<\/(?:nav|header|footer)>/gi, " ");
      const text = htmlText(content);
      const sections = [...content.matchAll(/<h[2-4]\b[^>]*>([\s\S]*?)<\/h[2-4]>([\s\S]*?)(?=<h[2-4]\b|$)/gi)]
        .map(match => `${htmlText(match[1])}: ${htmlText(match[2]).slice(0, 400)}`).join("\n");
      source.excerpt = sections ? sections.slice(0, 7000) : text.slice(0, 5000);
      source.links = [...content.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)].flatMap(match => {
        try {
          const url = publicUrl(new URL(match[1].replace(/&amp;/g, "&"), detail.url).href);
          const title = htmlText(match[2]).slice(0, 100);
          return url && title && new URL(url).hostname !== new URL(detail.url).hostname ? [{ title, url }] : [];
        } catch { return []; }
      }).slice(0, 20);
    }));
    return sources;
  } catch { return []; }
}

/** Repair missing/guessed domains using observed search links, never name-to-domain guesses. */
export async function searchRestaurantWebsites(name: string, location: string) {
  try {
    // Extra qualifiers and exact-phrase quoting can suppress the business's
    // actual site. Ownership is established by reading the returned pages.
    return (await searchPublicSources(`${name} ${location}`)).map(source => officialUrl(source.url)).filter(Boolean).slice(0, 4);
  } catch { return []; }
}
