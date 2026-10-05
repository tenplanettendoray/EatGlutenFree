import assert from "node:assert/strict";
import test from "node:test";
import { loadTsModule } from "./load-ts-module.mjs";

const { verifyDiscoveredRestaurant, matchesBusiness, matchesBusinessDomain, menuEvidence } = loadTsModule("app/lib/restaurant-verification.ts");
const input = { location: "Italy", food: "", allergies: ["Gluten", "Wheat"] };
const restaurant = {
  name: "Juniper Table", cuisine: ["Italian"], website: "https://junipertable.it/",
  menuSourceUrl: "https://invented-menu.it/", qualitySourceUrl: "https://invented-award.it/",
  evidenceSummary: "Guaranteed safe", popularitySummary: "5 stars", rankingReason: "Best",
  supportedAllergies: ["Gluten", "Wheat"], missingAllergies: [],
  locations: [{ label: "Rome", address: "Rome, Italy", website: "https://wrong-branch.it/", sourceUrl: "https://invented-source.it/" }],
};

test("public popularity determines discovery order regardless of specialty", () => {
  const { rankRestaurantMatches } = loadTsModule("app/lib/restaurant-verification.ts");
  const supported = { ...restaurant, websiteStatus: "verified", supportedAllergies: ["Gluten"], missingAllergies: [] };
  const candidates = [
    { ...supported, name: "Gelato Corner", cuisine: ["Gelato", "Dessert"], dedicatedGlutenFree: true, popularityTier: 2 },
    { ...supported, name: "Uncertain Place", missingAllergies: ["Gluten"], supportedAllergies: [], popularityTier: 1 },
    { ...supported, name: "Italian Table", cuisine: ["Italian", "Pasta"], popularityTier: 5 },
    { ...supported, name: "Dedicated Table", cuisine: ["Italian", "Pasta"], dedicatedGlutenFree: true, popularityTier: 3 },
  ];
  assert.deepEqual(rankRestaurantMatches(candidates, { ...input, allergies: ["Gluten"] }).map(item => item.name),
    ["Italian Table", "Dedicated Table", "Gelato Corner", "Uncertain Place"]);
  assert.equal(rankRestaurantMatches(candidates, { ...input, food: "gelato", allergies: ["Gluten"] })[0].name, "Italian Table");
  assert.equal(candidates[0].matchQuality, undefined);
});

test("unreadable, parked, and unrelated websites do not erase a candidate or leak unverified links", async () => {
  for (const html of [null, "<title>Juniper Table</title>Buy this domain", "<title>Other restaurant</title>Gluten-free menu"]) {
    const result = await verifyDiscoveredRestaurant(restaurant, input, async url => html ? { url, html } : null);
    assert.equal(result.name, restaurant.name);
    assert.equal(result.website, "");
    assert.equal(result.menuSourceUrl, "");
    assert.equal(result.websiteStatus, "unverified");
    assert.deepEqual(result.supportedAllergies, []);
    assert.deepEqual(result.missingAllergies, input.allergies);
    assert.equal(result.locations[0].website, "");
    assert.equal(result.locations[0].address, input.location);
    assert.match(result.qualitySourceUrl, /google\.com\/maps\/search/);
    assert.doesNotMatch(JSON.stringify(result), /invented-|wrong-branch|Guaranteed|5 stars/);
  }
});

test("country searches can verify a local-language business without exact country text", async () => {
  const result = await verifyDiscoveredRestaurant(restaurant, input, async url => ({ url, html: '<title>Juniper Table</title><p>Ristorante a Roma. Cucina 100% senza glutine.</p>' }));
  assert.equal(result.websiteStatus, "verified");
  assert.deepEqual(result.supportedAllergies, ["Gluten"]);
  assert.deepEqual(result.missingAllergies, ["Wheat"]);
  assert.match(result.allergenEvidence[0].quote, /100% senza glutine/);
  assert.equal(result.dedicatedGlutenFree, true);
});

test("only fetched related pages can supply menu evidence, and one failed link is tolerated", async () => {
  const fetched = [];
  const result = await verifyDiscoveredRestaurant(restaurant, input, async url => {
    fetched.push(url);
    if (url.endsWith('/faq')) throw Error("timeout");
    return { url, html: url.endsWith('/menu') ? '<p>100% gluten-free food.</p>' : '<title>Juniper Table</title><p>Restaurant</p><a href="/menu">Menu</a><a href="/faq">FAQ</a><a href="https://wrong.it/menu">Menu</a>' };
  });
  assert.equal(result.menuSourceUrl, "https://junipertable.it/menu");
  assert.equal(result.allergenEvidence.length, 1);
  assert.ok(fetched.every(url => url.startsWith("https://junipertable.it/")));
});

test("title identity tolerates joined brand words but not an unrelated page", () => {
  assert.equal(matchesBusiness({ html: '<title>MamaEat</title><p>Restaurant menu</p>' }, 'Mama Eat'), true);
  assert.equal(matchesBusiness({ html: '<title>MamaEat</title><p>Restaurant menu</p>' }, 'Mama Eat - Roma'), true);
  assert.equal(matchesBusiness({ html: '<title>Somewhere else</title><p>Juniper Table restaurant menu</p>' }, 'Juniper Table'), false);
  assert.equal(matchesBusiness({ html: '<title>Al Bistro</title><p>Restaurant menu</p>' }, 'Bistrò'), false);
  assert.equal(matchesBusiness({ html: '<title>Antlers</title><p>Restaurant menu</p>' }, 'Ant'), false);
});

test("third-party menu mirrors cannot become official website buttons", async () => {
  const result = await verifyDiscoveredRestaurant({ ...restaurant, website: "https://juniper-table.res-discover.com/menu" }, input, async () => { throw Error("must not fetch directory"); });
  assert.equal(result.website, "");
  assert.equal(result.name, restaurant.name);
  assert.equal(matchesBusinessDomain("https://florence.city/p/ristorante-quinoa", "Ristorante Quinoa"), false);
  assert.equal(matchesBusinessDomain("https://www.ristorantequinoa.it/", "Ristorante Quinoa"), true);
  assert.equal(matchesBusinessDomain("https://www.sgranoglutenfree.it/", "Osteria dello Sgrano"), true);
  assert.equal(matchesBusinessDomain("https://vivimilano.corriere.it/ristoranti/sgrano", "Sgrano Milano"), false);
});

test("negated claims and gluten-free dessert alone do not establish burger accommodation", () => {
  for (const phrase of ["No gluten-free buns", "We do not offer gluten-free buns", "Gluten-free options are not available", "Gluten-free cake"]) {
    assert.deepEqual(menuEvidence([{ url: restaurant.website, html: `<p>${phrase}</p>` }], { ...input, food: "Burgers" }), [], phrase);
  }
  assert.equal(menuEvidence([{ url: restaurant.website, html: '<p>Gluten-free buns available</p>' }], { ...input, food: "Burgers" }).length, 1);
});

test("allergy pages and a location page are checked before repeated menu variants", async () => {
  const visited = [];
  const result = await verifyDiscoveredRestaurant(restaurant, { location: "London", food: "burgers", allergies: ["Gluten"] }, async url => {
    visited.push(url);
    return { url, html: url === restaurant.website
      ? '<title>Juniper Table</title><p>Restaurant burgers</p><a href="/menu/brunch">Menu</a><a href="/menu/lunch">Menu</a><a href="/menu/dinner">Menu</a><a href="/menu/drinks">Menu</a><a href="/locations">Locations</a><a href="/allergens">Allergens</a>'
      : url.endsWith('/allergens') ? '<p>Gluten-free buns available.</p>'
      : url.endsWith('/locations') ? '<p>London</p>' : '<p>Menu</p>' };
  });
  assert.ok(visited.includes('https://junipertable.it/allergens'));
  assert.ok(visited.includes('https://junipertable.it/locations'));
  assert.equal(visited.length, 5);
  assert.equal(result.locationConfirmed, true);
  assert.deepEqual(result.supportedAllergies, ['Gluten']);
});

test("a dedicated bakery with no burger evidence cannot outrank confirmed gluten-free burgers", async () => {
  const burgerInput = { location: "London", food: "burgers", allergies: ["Gluten"] };
  const bakery = await verifyDiscoveredRestaurant(restaurant, burgerInput, async url => ({ url, html: '<title>Juniper Table</title><p>London bakery. 100% gluten-free patisserie.</p>' }));
  const burgers = await verifyDiscoveredRestaurant({ ...restaurant, name: 'Cedar Kitchen', website: 'https://cedarkitchen.co.uk/' }, burgerInput, async url => ({ url, html: '<title>Cedar Kitchen</title><p>London restaurant. Burgers with gluten-free buns.</p>' }));
  const { rankRestaurantMatches } = loadTsModule('app/lib/restaurant-verification.ts');
  assert.equal(rankRestaurantMatches([bakery, burgers], burgerInput)[0].name, 'Cedar Kitchen');
  assert.match(bakery.evidenceSummary, /requested dish was not confirmed/);
  assert.equal(bakery.confidence, 'medium');
});

test("model grounding receives actual search sources and preserves named street-food venues", async () => {
  const source = { title: "El Maiz", url: "https://elmaiz.it/", snippet: "Restaurant in Rome" };
  const loaded = loadTsModule("app/lib/openrouter-discovery.ts", {
    "./restaurant-web-search": { ...loadTsModule("app/lib/restaurant-web-search.ts"), searchRestaurantSources: async () => [source] },
    "./restaurant-verification": { verifyAndRankRestaurants: async candidates => candidates },
  }, {
    process: { env: { OPENROUTER_API_KEY: "sk-or-v1-test" } },
    fetch: async (_url, options) => {
      const body = JSON.parse(options.body);
      assert.deepEqual(JSON.parse(body.messages[1].content).webSources, [source]);
      assert.equal(JSON.parse(body.messages[1].content).loc, "Rome");
      return Response.json({ choices: [{ message: { content: JSON.stringify({ p: [{ n: "El Maiz Street Food", a: "Rome", e: "May offer gluten-free options" }] }) } }] });
    },
  });
  const result = await loaded.discoverRestaurantsWithOpenRouter({ ...input, location: "Rome, Italy" });
  assert.equal(result.restaurants[0].name, "El Maiz Street Food");
});

test("public search parser unwraps result URLs, strips markup and rejects private links", () => {
  const { parseSearchSources } = loadTsModule("app/lib/restaurant-web-search.ts");
  const block = (url, title) => `<div class="result results_links results_links_deep"><a class="result__a" href="${url}">${title}</a><a class="result__snippet">An <b>Italian</b> restaurant</a></div>`;
  const parsed = parseSearchSources(block('//duckduckgo.com/l/?uddg=https%3A%2F%2Fjunipertable.it%2F&amp;rut=x', 'Juniper &amp; Table') + block('http://127.0.0.1', 'Private'));
  assert.deepEqual(parsed, [{ title: "Juniper & Table", url: "https://junipertable.it/", snippet: "An Italian restaurant" }]);
});

test("missing website recovery verifies an observed URL and retains unresolved candidates", async () => {
  const web = loadTsModule("app/lib/public-web.ts");
  const loaded = loadTsModule("app/lib/restaurant-verification.ts", {
    "./restaurant-web-search": { ...loadTsModule("app/lib/restaurant-web-search.ts"), searchRestaurantWebsites: async name => name === restaurant.name ? ["https://junipertable.it/"] : [] },
    "./public-web": { ...web, fetchPublicPage: async url => ({ url, html: '<title>Juniper Table</title><p>Restaurant with a gluten-free menu. 1 Juniper Street, Rome. 2 Cedar Street, Florence.</p>' }) },
  });
  const candidates = [{ ...restaurant, name: "Uncertain Place", website: "", popularityTier: 1 }, { ...restaurant, website: "", popularityTier: 4 }];
  const result = await loaded.verifyAndRankRestaurants(candidates, input);
  assert.equal(result.length, 2);
  assert.equal(result[0].name, restaurant.name);
  assert.equal(result[0].website, "https://junipertable.it/");
  assert.deepEqual(result[0].supportedAllergies, ["Gluten"]);
  assert.equal(result[1].name, "Uncertain Place");
  assert.equal(result[1].website, "");
});

test("branches sharing a checked official site are grouped without losing their locations", async () => {
  const web = loadTsModule("app/lib/public-web.ts");
  const loaded = loadTsModule("app/lib/restaurant-verification.ts", {
    "./public-web": { ...web, fetchPublicPage: async url => ({ url, html: '<title>Juniper Table</title><p>Restaurant with a gluten-free menu. 1 Juniper Street, Rome. 2 Cedar Street, Florence.</p>' }) },
  });
  const branches = ["1 Juniper Street, Rome", "2 Cedar Street, Florence"].map(address => ({ ...restaurant, locations: [{ ...restaurant.locations[0], address }] }));
  const result = await loaded.verifyAndRankRestaurants(branches, input);
  assert.equal(result.length, 1);
  assert.deepEqual(result[0].locations.map(item => item.address), ["1 Juniper Street, Rome", "2 Cedar Street, Florence"]);
});
