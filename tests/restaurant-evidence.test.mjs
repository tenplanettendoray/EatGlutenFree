import assert from "node:assert/strict";
import test from "node:test";
import { loadTsModule } from "./load-ts-module.mjs";

const { verifyRestaurantCandidate, assessRestaurantPages } = loadTsModule("app/lib/restaurant-evidence.ts");
const candidate = { n: "Juniper Table", w: "https://junipertable.fr/" };
const input = { location: "Paris, France", food: "Burgers", allergies: ["Gluten", "Sesame"] };

test("French address and carte links supply city and dish evidence", async () => {
  const pages = {
    [candidate.w]: '<title>Juniper Table</title><a href="/adresses">Nos adresses</a><a href="/carte">La carte</a>',
    "https://junipertable.fr/adresses": "<p>Notre restaurant à Paris.</p>",
    "https://junipertable.fr/carte": "<p>Burgers avec pain sans gluten disponible.</p>",
  };
  const result = await verifyRestaurantCandidate(candidate, input, async url => pages[url] ? { url, html: pages[url] } : null);
  assert.equal(result.name, candidate.n);
  assert.deepEqual(result.supportedAllergies, ["Gluten"]);
  assert.deepEqual(result.missingAllergies, ["Sesame"]);
  assert.equal(result.qualitySourceUrl, "https://junipertable.fr/adresses");
});

test("large hydration payloads no longer exclude otherwise readable restaurant pages", async () => {
  const html = '<title>Juniper Table</title><script>' + ' '.repeat(800_000) + '</script><p>Paris restaurant burgers</p>';
  const web = loadTsModule("app/lib/public-web.ts", {
    "node:dns/promises": { resolve4: async () => ["1.1.1.1"], resolve6: async () => [] },
  }, { fetch: async () => new Response(html, { headers: { "Content-Type": "text/html" } }) });
  const page = await web.fetchPublicPage(candidate.w);
  assert.ok(page);
  assert.ok(assessRestaurantPages(candidate, [page], input));
});

test("wrong city, unrelated business, and dessert-only allergy claims remain rejected", () => {
  const html = '<title>Juniper Table</title><p>Paris restaurant burgers. Gluten-free cake.</p>';
  const assess = text => assessRestaurantPages(candidate, [{ url: candidate.w, html: text }], input);
  assert.equal(assess(html.replace('Paris', 'Lyon')), null);
  assert.equal(assess(html.replace('Juniper Table', 'Another business')), null);
  assert.deepEqual(assess(html).supportedAllergies, []);
  assert.deepEqual(assess(html.replace('Gluten-free cake', 'No gluten-free buns')).supportedAllergies, []);
});
