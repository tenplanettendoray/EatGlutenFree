import { NextRequest, NextResponse } from "next/server";
import { fetchPublicPage, officialUrl, publicUrl } from "../../lib/public-web";

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
  const hash = [...key].reduce((total, character) => total + character.charCodeAt(0), 0);
  return fallbackPhotos[hash % fallbackPhotos.length];
}

export async function GET(request: NextRequest) {
  const name = clean(request.nextUrl.searchParams.get("name"), 160);
  const food = clean(request.nextUrl.searchParams.get("food"), 100);
  const website = safeUrl(request.nextUrl.searchParams.get("website"));
  const menu = safeUrl(request.nextUrl.searchParams.get("menu"));

  for (const pageUrl of [website, menu]) {
    if (!pageUrl) continue;
    try {
      const page = await fetchPublicPage(pageUrl.toString());
      if (!page) continue;
      const html = page.html;
      const rawImage = metaContent(html, ["og:image:secure_url", "og:image", "twitter:image", "twitter:image:src"]) || jsonLdImage(html);
      if (!rawImage) continue;
      const imageUrl = publicUrl(new URL(rawImage, page.url).toString());
      if (!imageUrl) continue;
      return NextResponse.redirect(imageUrl.toString(), {
        headers: {
          "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
        },
      });
    } catch {
      continue;
    }
  }

  return NextResponse.redirect(fallbackPhoto(name, food), {
    headers: {
      "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
    },
  });
}
