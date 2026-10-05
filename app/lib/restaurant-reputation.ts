import { htmlText, normalize, publicUrl } from "./public-web";
import type { SearchSource } from "./restaurant-web-search";

function sameName(a: string, b: string) {
  const words = normalize(b.split(/\s[-–—|]\s/)[0]).split(" ").filter(word => !/^(the|restaurant|ristorante|cafe|bar|le|la)$/.test(word));
  const text = normalize(a).replace(/ /g, "");
  return words.length > 0 && words.every(word => text.includes(word));
}

/** Read published review aggregates for the named business, never the model's estimate. */
export function readOnlineRating(html: string, name: string) {
  for (const script of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const queue: unknown[] = [JSON.parse(script[1])];
      for (let visited = 0; queue.length && visited < 300; visited++) {
        const item = queue.shift();
        if (!item || typeof item !== "object") continue;
        if (Array.isArray(item)) { queue.push(...item); continue; }
        const record = item as Record<string, unknown>;
        const aggregate = record.aggregateRating as Record<string, unknown> | undefined;
        if (typeof record.name === "string" && sameName(record.name, name) && aggregate) {
          const rating = Number(aggregate.ratingValue), reviewCount = Number(aggregate.reviewCount ?? aggregate.ratingCount);
          const best = Number(aggregate.bestRating ?? 5);
          if (best === 5 && rating > 0 && rating <= 5 && Number.isInteger(reviewCount) && reviewCount > 0) return { rating, reviewCount };
        }
        queue.push(...Object.values(record).filter(value => value && typeof value === "object"));
      }
    } catch { /* Invalid structured data does not supply a rating. */ }
  }
  return null;
}

/** Only extract a score when the search result names this business and quotes both score and review count. */
export function ratingFromSources(sources: SearchSource[], name: string, city: string) {
  for (const source of sources) {
    const text = htmlText(`${source.title} ${source.snippet}`);
    if (!sameName(source.title, name) || !normalize(text).includes(normalize(city))) continue;
    const match = text.match(/\b([1-5](?:[.,]\d)?)\s*(?:\/\s*5|out of 5|stars?|★|⭐)?\s*[·•|]?\s*\(?\s*([\d,]+)\s*(?:reviews?|ratings?)\b/i);
    if (!match) continue;
    const rating = Number(match[1].replace(",", ".")), reviewCount = Number(match[2].replace(/,/g, ""));
    const qualitySourceUrl = publicUrl(source.url);
    if (qualitySourceUrl && rating <= 5 && reviewCount > 0) return { rating, reviewCount, qualitySourceUrl };
  }
  return null;
}
