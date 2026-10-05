import { NextRequest, NextResponse } from "next/server";
import { fetchPublicPage, officialUrl, publicUrl } from "../../lib/public-web";
import { searchRestaurantWebsites } from "../../lib/restaurant-web-search";
import { matchesBusiness, matchesBusinessDomain } from "../../lib/restaurant-verification";

const fallbackPhotos = [
  "https://images.unsplash.com/photo-1552566626-52f8b828add9?auto=format&fit=crop&w=1200&q=82",
  "https://images.unsplash.com/photo-1544148103-0773bf10d330?auto=format&fit=crop&w=1200&q=82",
  "https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=1200&q=82",
  "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?auto=format&fit=crop&w=1200&q=82",
  "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=1200&q=82",
  "https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=1200&q=82",
];

function clean(value: string | null, maxLength = 500) {
  return (value || "").trim().replace(/\s+/g, " ").slice(0, maxLength);
}

function safeUrl(value: string | null) {
  const url = officialUrl(value);
  return url ? new URL(url) : null;
}

function decodeEntity(value: string) {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function metaContent(html: string, names: string[]) {
  for (const name of names) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regexes = [
      new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`, "i"),
      new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["'][^>]*>`, "i"),
    ];
    for (const regex of regexes) {
      const match = html.match(regex)?.[1];
      if (match) return decodeEntity(match.trim());
    }
  }
  return "";
}

function jsonLdImage(html: string) {
  const scripts = html.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi) || [];
  for (const script of scripts.slice(0, 8)) {
    const json = script.replace(/^<script[^>]*>/i, "").replace(/<\/script>$/i, "").trim();
    try {
      const parsed = JSON.parse(json) as unknown;
      const queue = Array.isArray(parsed) ? [...parsed] : [parsed];
      while (queue.length) {
        const item = queue.shift();
        if (!item || typeof item !== "object") continue;
        const record = item as Record<string, unknown>;
        const image = record.image;
        if (typeof image === "string") return image;
        if (Array.isArray(image) && typeof image[0] === "string") return image[0];
        for (const value of Object.values(record)) {
          if (value && typeof value === "object") queue.push(value);
        }
      }
    } catch {
      continue;
    }
  }
  return "";
}

function fallbackPhoto(name: string, food: string) {
  const key = `${name} ${food}`.toLowerCase();
  if (/\bburger|hamburger|cheeseburger\b/.test(key)) return fallbackPhotos[4];
  if (/\bpizza\b/.test(key)) return fallbackPhotos[5];
  if (/dessert|patisserie|pastry|bakery|cake|cookie|donut|sweet|gelato|ice cream/.test(key)) return "https://images.unsplash.com/photo-1551024506-0bccd828d307?auto=format&fit=crop&w=1200&q=82";
  const hash = [...key].reduce((total, character) => total + character.charCodeAt(0), 0);
  return fallbackPhotos[hash % fallbackPhotos.length];
}

export function pagePhotos(html: string, pageUrl: string) {
  const candidates = [metaContent(html, ["og:image:secure_url", "og:image", "twitter:image", "twitter:image:src"]), jsonLdImage(html)];
  const tags = [...html.matchAll(/<img\b[^>]*>/gi)].map(match => match[0]);
  for (const tag of tags) {
    if (/logo|icon|avatar|sprite|pixel|tracking|payment|flag|badge/i.test(tag)) continue;
    const sizes = tag.match(/\bsrcset=["']([^"']+)["']/i)?.[1];
    const src = sizes?.split(",").at(-1)?.trim().split(/\s+/)[0]
      || tag.match(/\bdata-src=["']([^"']+)["']/i)?.[1]
      || tag.match(/\bsrc=["']([^"']+)["']/i)?.[1];
    if (src) candidates.push(src);
  }
  return [...new Set(candidates.flatMap(raw => {
    try { const url = raw && publicUrl(new URL(decodeEntity(raw), pageUrl).href); return url && !/logo|icon|\.svg(?:\?|$)/i.test(url) ? [url] : []; } catch { return []; }
  }))].slice(0, 8);
}

export async function GET(request: NextRequest) {
  const name = clean(request.nextUrl.searchParams.get("name"), 160);
  const food = clean(request.nextUrl.searchParams.get("food"), 100);
  const website = safeUrl(request.nextUrl.searchParams.get("website"));
  const menu = safeUrl(request.nextUrl.searchParams.get("menu"));
  const location = clean(request.nextUrl.searchParams.get("location"), 160).split(",")[0];
  const urls = [...new Set([website?.href, menu?.href].filter((url): url is string => Boolean(url)))];
  // Try the supplied site first, then repair it if it is unavailable or has no
  // usable photos. The lookup remains bounded and all pages pass identity checks.
  const checked = new Set<string>();
  for (let pass = 0; pass < 2; pass++) {
    if (pass === 1 && name && location) urls.push(...await searchRestaurantWebsites(name, location));
    for (const pageUrl of urls.filter(url => !checked.has(url)).slice(0, 4 - checked.size)) {
      checked.add(pageUrl);
      if (!pageUrl) continue;
      try {
        const page = await fetchPublicPage(pageUrl.toString());
        if (!page) continue;
        if (name && (!matchesBusinessDomain(page.url, name) || !matchesBusiness(page, name))) continue;
        const html = page.html;
        const photos = pagePhotos(html, page.url);
        if (!photos.length) {
          const gallery = [...html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>/gi)].map(match => match[1]).find(link => /gallery|photos|galerie|ristorante|about/i.test(link));
          if (gallery) { const url = new URL(gallery, page.url); if (url.hostname === new URL(page.url).hostname) { const extra = await fetchPublicPage(url.href); if (extra) photos.push(...pagePhotos(extra.html, extra.url)); } }
        }
        const imageUrl = photos[0];
        if (!imageUrl) continue;
        if (request.nextUrl.searchParams.get("format") === "json") return NextResponse.json({ url: imageUrl, candidates: photos, illustrative: false }, { headers: { "Cache-Control": "public, max-age=3600" } });
        return NextResponse.redirect(imageUrl.toString(), {
          headers: {
            "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
          },
        });
      } catch {
        continue;
      }
    }
  }

  if (request.nextUrl.searchParams.get("format") === "json") return NextResponse.json({ url: "/restaurant-variety-atlas.png", illustrative: true });
  return NextResponse.redirect(fallbackPhoto(name, food), {
    headers: {
      "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
    },
  });
}
