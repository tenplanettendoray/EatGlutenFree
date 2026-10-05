import assert from "node:assert/strict";
import test from "node:test";
import { loadTsModule } from "./load-ts-module.mjs";

const { readOnlineRating, ratingFromSources } = loadTsModule("app/lib/restaurant-reputation.ts");
test("online stars require a named source aggregate on a five-point scale", () => {
  const html = record => `<script type="application/ld+json">${JSON.stringify({ "@graph": [record] })}</script>`;
  const place = { name: "Juniper Table", aggregateRating: { ratingValue: 4.5, reviewCount: 128, bestRating: 5 } };
  assert.deepEqual(readOnlineRating(html(place), "Juniper Table"), { rating: 4.5, reviewCount: 128 });
  assert.equal(readOnlineRating(html(place), "Cedar House"), null);
  assert.equal(readOnlineRating(html({ ...place, aggregateRating: { ratingValue: 9, reviewCount: 128, bestRating: 10 } }), "Juniper Table"), null);
  assert.equal(readOnlineRating("The AI thinks this place deserves 5 stars", "Juniper Table"), null);
});
test("review snippets must match the business and city and include a review count", () => {
  const source = { title: "Juniper Table, Rome", url: "https://www.google.com/maps/place/Juniper", snippet: "4.5 (128 reviews)" };
  assert.deepEqual(ratingFromSources([source], "Juniper Table", "Rome"), { rating: 4.5, reviewCount: 128, qualitySourceUrl: source.url });
  assert.deepEqual(ratingFromSources([{ ...source, snippet: "4.5 · 1,128 reviews" }], "Juniper Table", "Rome"), { rating: 4.5, reviewCount: 1128, qualitySourceUrl: source.url });
  assert.equal(ratingFromSources([source], "Juniper Table", "Paris"), null);
  assert.equal(ratingFromSources([{ ...source, snippet: "5 stars" }], "Juniper Table", "Rome"), null);
});

test("photo discovery uses real page images and skips logos and unsafe URLs", () => {
  const { pagePhotos } = loadTsModule("app/api/restaurant-image/route.ts", { "next/server": {} });
  const images = pagePhotos('<meta property="og:image" content="/logo.svg"><img src="/logo.png"><img data-src="/dining.jpg"><img srcset="/dish-small.jpg 400w, /dish-large.jpg 1200w"><img src="http://127.0.0.1/private.jpg">', "https://junipertable.it/");
  assert.deepEqual(images, ["https://junipertable.it/dining.jpg", "https://junipertable.it/dish-large.jpg"]);
});

test("photo lookup repairs a supplied website that cannot be loaded", async () => {
  const requested = [];
  const publicWeb = loadTsModule("app/lib/public-web.ts");
  const { GET } = loadTsModule("app/api/restaurant-image/route.ts", {
    "next/server": { NextResponse: { json: value => value } },
    "../../lib/public-web": { ...publicWeb, fetchPublicPage: async url => {
      requested.push(url);
      return url === "https://junipertable.it/" ? { url, html: '<title>Juniper Table</title><p>Restaurant menu</p><img src="/dining.jpg">' } : null;
    } },
    "../../lib/restaurant-web-search": { searchRestaurantWebsites: async () => ["https://junipertable.it/"] },
  });
  const result = await GET({ nextUrl: new URL("http://localhost/api/restaurant-image?name=Juniper%20Table&location=Rome&website=https://junipertable.com&format=json") });
  assert.equal(result.illustrative, false);
  assert.equal(result.url, "https://junipertable.it/dining.jpg");
  assert.deepEqual(requested, ["https://junipertable.com/", "https://junipertable.it/"]);
});
