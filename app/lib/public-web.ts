import { resolve4, resolve6 } from "node:dns/promises";
import { isIP } from "node:net";

export const sourceHeaders = { "User-Agent": "SafeServe/1.0 (restaurant research; https://github.com/tenplanettendoray/Allergen-Reccomen)", "Accept-Language": "en,fr;q=0.8" };

export function publicAddress(address: string) {
  if (address.includes(":")) return /^[23][0-9a-f]{3}:/i.test(address) && !/^2001:(?:db8|0|10|20):/i.test(address);
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some(p => !Number.isInteger(p) || p < 0 || p > 255)) return false;
  const [a, b] = parts;
  return !(a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && [0, 168].includes(b)) || (a === 198 && [18, 19, 51].includes(b)) || (a === 203 && b === 0));
}

export function publicUrl(value: unknown): string {
  if (typeof value !== "string" || value.length > 1500) return "";
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/\.$/, "");
    if (!/^https?:$/.test(url.protocol) || url.username || url.password || url.port && !["80", "443"].includes(url.port)) return "";
    if (!host.includes(".") || /(?:^|\.)(?:localhost|local|internal|test|invalid|example)$/.test(host) || /[\[\]:]/.test(host) || /^\d+(?:\.\d+)*$/.test(host)) return "";
    url.hash = "";
    return url.toString();
  } catch { return ""; }
}

export function officialUrl(value: unknown) {
  const url = publicUrl(value);
  if (!url) return "";
  const host = new URL(url).hostname;
  return /(^|\.)(google|bing|yelp|tripadvisor|thefork|facebook|instagram|tiktok|wikipedia|ubereats|deliveroo|doordash|openstreetmap|findmeglutenfree|atly|wanderlog|happycow|restaurantguru|opentable|wheree|trustpilot|res-discover|res-menu|restomenu|sluurpy|eater|wheatlesswanderlust|mygfguide)\./i.test(host) ? "" : url;
}

/** Bound bytes while reading, rather than allocating an arbitrary response first. */
export async function boundedText(response: Response, maxBytes = 700_000) {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let text = "", size = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > maxBytes) { await reader.cancel(); throw new Error("Source exceeds size limit"); }
      text += decoder.decode(chunk.value, { stream: true });
    }
    return text + decoder.decode();
  } finally { reader.releaseLock(); }
}

async function fetchUncachedPublicPage(value: string, allowXml = false): Promise<{ url: string; html: string } | null> {
  let url = publicUrl(value);
  const signal = AbortSignal.timeout(6500);
  try {
    for (let redirects = 0; url && redirects <= 3; redirects++) {
      signal.throwIfAborted();
      const host = new URL(url).hostname;
      const records = await Promise.race([
        Promise.allSettled([resolve4(host), resolve6(host)]).then(results => results.flatMap(r => r.status === "fulfilled" ? r.value : [])),
        new Promise<never>((_, reject) => signal.addEventListener("abort", () => reject(new Error("DNS timeout")), { once: true })),
      ]);
      // Workers can include CNAME targets alongside A/AAAA answers. Validate
      // actual IP records; a CNAME hostname is not a private IP address.
      const addresses = records.filter(address => isIP(address));
      if (!addresses.length || addresses.some(address => !publicAddress(address))) { console.warn("Website DNS check failed", host, addresses.length ? "non-public address" : "no public records"); return null; }
      const response = await fetch(url, { headers: { ...sourceHeaders, Accept: "text/html,application/xhtml+xml" }, redirect: "manual", signal });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get("location");
        await response.body?.cancel();
        url = location ? publicUrl(new URL(location, url).toString()) : "";
        continue;
      }
      const contentType = response.headers.get("content-type") || "";
      if (!response.ok || !(/text\/html|application\/xhtml\+xml/i.test(contentType) || allowXml && /(?:application|text)\/(?:rss\+)?xml/i.test(contentType))) { console.warn("Website page unavailable", host, response.status); await response.body?.cancel(); return null; }
      // Modern restaurant sites often include more than 700 KB of hydration
      // data before their menu/footer. Keep a hard limit without excluding them.
      return { url, html: await boundedText(response, 2_500_000) };
    }
  } catch (error) { console.warn("Website request failed", url ? new URL(url).hostname : "invalid", error instanceof Error ? error.name : "network"); }
  return null;
}

type PublicPage = { url: string; html: string };
const pageCache = new Map<string, { page: PublicPage; expires: number }>();
const pendingPages = new Map<string, Promise<PublicPage | null>>();

/** Repeated verification reuses public pages briefly, with a bounded memory budget. */
export async function fetchPublicPage(value: string, allowXml = false): Promise<PublicPage | null> {
  const url = publicUrl(value);
  if (!url) return null;
  const key = `${allowXml}:${url}`;
  const cached = pageCache.get(key);
  if (cached && cached.expires > Date.now()) return cached.page;
  pageCache.delete(key);
  const existing = pendingPages.get(key);
  if (existing) return existing;
  const pending = fetchUncachedPublicPage(url, allowXml);
  if (pendingPages.size < 64) pendingPages.set(key, pending);
  try {
    const page = await pending;
    if (page) {
      pageCache.set(key, { page, expires: Date.now() + 5 * 60_000 });
      while (pageCache.size > 16 || [...pageCache.values()].reduce((size, item) => size + item.page.html.length, 0) > 4_000_000) {
        const oldest = pageCache.keys().next().value;
        if (!oldest) break;
        pageCache.delete(oldest);
      }
    }
    return page;
  } finally { pendingPages.delete(key); }
}

export function htmlText(html: string) {
  return html.replace(/<(script|style|noscript|svg)\b[^>]*>[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " ")
    .replace(/&amp;/gi, "&").replace(/&quot;/gi, '"').replace(/&#0?39;|&apos;/gi, "'").replace(/&nbsp;/gi, " ")
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => parseInt(n, 16) <= 0x10ffff ? String.fromCodePoint(parseInt(n, 16)) : " ")
    .replace(/&#(\d+);/g, (_, n) => Number(n) <= 0x10ffff ? String.fromCodePoint(Number(n)) : " ").replace(/\s+/g, " ").trim();
}

export function normalize(value: string) {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

export function websiteIdentity(html: string, names: string[], city: string) {
  const title = [...html.matchAll(/<(?:title|h1)[^>]*>([\s\S]*?)<\/(?:title|h1)>/gi)].map(match => htmlText(match[1])).join(" ");
  const text = normalize(htmlText(html));
  const identity = normalize(title);
  if (/domain (?:is )?for sale|buy this domain|domain expired|website coming soon/i.test(text)) return false;
  const nameMatch = names.some(name => {
    const words = normalize(name).split(" ").filter(w => !/^(restaurant|cafe|bar|the|le|la|les|and|et|de|du)$/.test(w));
    return words.length > 0 && words.every(word => (` ${identity} `).includes(` ${word} `));
  });
  const cityWords = normalize(city.split(",")[0]).split(" ");
  return nameMatch && cityWords.length > 0 && cityWords.every(word => (` ${text} `).includes(` ${word} `)) && /restaurant|menu|cuisine|food|dining|cafe|bistro|burger|pizza|cucina|restaurante/.test(text);
}
