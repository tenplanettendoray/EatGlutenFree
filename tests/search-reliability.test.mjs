import assert from "node:assert/strict";
import test from "node:test";
import { loadTsModule } from "./load-ts-module.mjs";

const web = loadTsModule("app/lib/restaurant-web-search.ts");
const verification = loadTsModule("app/lib/restaurant-verification.ts");
const source = { title: "Juniper Table London", url: "https://junipertable.co.uk/", snippet: "Juniper Table restaurant in London serves burgers. Ask about allergens." };
const input = { location: "London", food: "burgers", allergies: ["Gluten"] };
function discovery(fetch, sources = [source]) {
  return loadTsModule("app/lib/openrouter-discovery.ts", {
    "./restaurant-web-search": { ...web, searchRestaurantSources: async () => [...sources], searchRestaurantWebsites: async () => [] },
    "./restaurant-verification": { ...verification, verifyAndRankRestaurants: async items => items.map(item => ({ ...item, website: "", locationConfirmed: false, foodConfirmed: false })) },
    "./restaurant-evidence": { reviewedCandidates: () => [], verifyRestaurantCandidate: async () => null },
  }, { fetch, process: { env: { OPENROUTER_API_KEY: "test", OPENROUTER_MODEL: "primary:free" } }, console: { error() {} } });
}
const answer = () => Response.json({ model: "liquid/lfm-2.5-2.6b:free", choices: [{ message: { content: JSON.stringify({ p: [{ n: "Juniper Table", city: "London", c: ["Burgers"] }] }) } }] });

test("upstream 429 tries one other free model and cools down the overloaded primary", async () => {
  const models = [];
  const loaded = discovery(async (_url, options) => {
    const body = JSON.parse(options.body); models.push(body.model);
    return body.model === "primary:free"
      ? Response.json({ error: { metadata: { limit_source: "upstream_provider_shared_pool" } } }, { status: 429 })
      : answer();
  });
  for (let i = 0; i < 2; i++) {
    const result = await loaded.discoverRestaurantsWithOpenRouter(input);
    assert.equal(result.model, "liquid/lfm-2.5-2.6b:free");
    assert.equal(result.restaurants[0].name, "Juniper Table");
  }
  assert.deepEqual(models, ["primary:free", "liquid/lfm-2.5-2.6b:free", "liquid/lfm-2.5-2.6b:free"]);
});

test("account quota stops all retries and subsequent requests during the cooldown", async () => {
  let calls = 0;
  const loaded = discovery(async () => { calls++; return Response.json({ error: { message: "Rate limit exceeded: free-models-per-day" } }, { status: 429 }); }, []);
  assert.equal((await loaded.discoverRestaurantsWithOpenRouter(input)).status, "quota");
  assert.equal((await loaded.discoverRestaurantsWithOpenRouter(input)).status, "quota");
  assert.equal(calls, 1);
});

test("AI-generated names need restaurant and requested-city evidence", async () => {
  const loaded = discovery(async () => Response.json({ choices: [{ message: { content: JSON.stringify({ p: [
    { n: "Juniper Table", city: "London" },
    { n: "Invented Kitchen", city: "London" },
    { n: "Our Favorite Baby Care Essentials", city: "London" },
    { n: "potential allergens", city: "London" },
    { n: "five or more poops", city: "London" },
    { n: "Cedar Kitchen", city: "London" },
  ] }) } }] }), [source, { title: "Cedar Kitchen Paris", url: "https://cedarkitchen.fr/", snippet: "Cedar Kitchen is a burger restaurant in Paris." }]);
  const result = await loaded.discoverRestaurantsWithOpenRouter(input);
  assert.deepEqual(result.restaurants.map(item => item.name), ["Juniper Table"]);
  assert.deepEqual(result.restaurants[0].supportedAllergies, []);
  assert.deepEqual(result.restaurants[0].missingAllergies, ["Gluten"]);
});

test("unrelated allergy articles and wrong-city pages are not restaurant sources", () => {
  assert.equal(web.relevantRestaurantSource({ title: "Our Favorite Baby Care Essentials", snippet: "Potential allergens in baby food", url: "https://babycare.com/" }, "Paris"), false);
  assert.equal(web.sourceSupportsRestaurant(source, "Juniper Table", { ...input, location: "Paris" }), false);
  assert.equal(web.mentionsLocation("Roma restaurant menu", "Rome"), true);
  assert.equal(web.mentionsLocation("Parisian food in London", "Paris"), false);
});

test("heuristic fallback never publishes an unverified website or article title", async () => {
  const loaded = discovery(async () => new Response("Daily quota exceeded", { status: 429 }), [
    { title: "Our Favorite Baby Care Essentials", url: "https://babycare.com/", snippet: "Paris burger allergens" },
    { title: "Juniper Table London", url: "https://junipertable.co.uk/", snippet: "London restaurant burgers" },
  ]);
  const result = await loaded.discoverRestaurantsWithOpenRouter(input);
  assert.equal(result.restaurants.length, 0);
  assert.equal(result.status, "quota");
});

test("quota fallback retains explicit local directory businesses with uncertainty labels", async () => {
  const directory = {
    title: "Gluten-Free Burger Joints in London",
    url: "https://www.findmeglutenfree.com/gb/london/burgers",
    snippet: "Gluten-free burger joints in London, UK.",
    excerpt: "1. The Red Lion: (36) 48 Parliament St, London SW1A 2NH, UK $$ Pub GF Menu\nGF menu items: Burgers, Bread/Buns\n2. Maxwell's Bar & Grill: (25) 34 King St, London WC2E 8JD, UK $$ Restaurant GF Menu\n3. Patty&Bun: (7) 15 Park Dr, London E14 9GG, UK Hamburger Restaurant\n4. Subscription options: newsletter\n5. Cedar Kitchen: 1 Rue Paris, Paris, France Restaurant",
  };
  const loaded = discovery(async () => new Response("Daily quota exceeded", { status: 429 }), [directory]);
  const result = await loaded.discoverRestaurantsWithOpenRouter(input);
  assert.equal(result.status, "used");
  assert.equal(result.provider, "Public web fallback");
  assert.deepEqual(result.restaurants.map(item => item.name), ["The Red Lion", "Maxwell's Bar & Grill", "Patty&Bun"]);
  assert.ok(result.restaurants.every(item => item.website === "" && item.supportedAllergies.length === 0));
  assert.ok(result.restaurants.every(item => item.evidenceSources[0].url === directory.url));
});

test("a generic Bing city result triggers alternate retrieval", async () => {
  const requests = [];
  const { searchPublicSources } = loadTsModule("app/lib/restaurant-web-search.ts", {
    "./public-web": { ...loadTsModule("app/lib/public-web.ts"), fetchPublicPage: async url => {
      requests.push(url);
      return { url, html: url.includes("bing.com")
        ? '<rss><channel><item><title>Visit London</title><link>https://www.visitlondon.com/</link><description>City guide and restaurants</description></item></channel></rss>'
        : '<div class="result results_links"><a class="result__a" href="https://www.findmeglutenfree.com/gb/london/burgers">Gluten-free burgers London</a><a class="result__snippet">Local restaurants and gluten-free burgers</a></div>' };
    } },
  });
  const results = await searchPublicSources("London gluten-free burgers");
  assert.equal(requests.length, 2);
  assert.deepEqual(results.map(item => item.title), ["Gluten-free burgers London"]);
});

test("cache keys share public discovery across plans without colliding non-Latin cities", async () => {
  const { restaurantSearchCacheKey } = loadTsModule("app/lib/search-cache.ts", { "../../db": {}, "../../db/schema": {} });
  const free = { ...input, mode: "free" };
  assert.equal(await restaurantSearchCacheKey(free), await restaurantSearchCacheKey({ ...free, mode: "premium" }));
  assert.notEqual(await restaurantSearchCacheKey({ ...free, location: "東京" }), await restaurantSearchCacheKey({ ...free, location: "大阪" }));
  assert.notEqual(await restaurantSearchCacheKey(free), await restaurantSearchCacheKey(free, 43));
});

test("website repair searches the business name and city without restrictive qualifiers", async () => {
  const requests = [];
  const { searchRestaurantWebsites } = loadTsModule("app/lib/restaurant-web-search.ts", {
    "./public-web": { ...loadTsModule("app/lib/public-web.ts"), fetchPublicPage: async url => {
      requests.push(new URL(url).searchParams.get('q'));
      return { url, html: '<rss><channel><item><title>Juniper Table London restaurant</title><link>https://junipertable.co.uk/</link><description>Burgers in London</description></item></channel></rss>' };
    } },
  });
  assert.deepEqual(await searchRestaurantWebsites('Juniper Table', 'London'), ['https://junipertable.co.uk/']);
  assert.ok(requests.every(query => query === 'Juniper Table London'));
});

test("when public retrieval is unavailable, AI leads still require verified city and dish", async () => {
  let fallbackPrompt;
  const loaded = loadTsModule("app/lib/openrouter-discovery.ts", {
    "./restaurant-web-search": { ...web, searchRestaurantSources: async () => [], searchRestaurantWebsites: async () => [] },
    "./restaurant-evidence": { reviewedCandidates: () => [], verifyRestaurantCandidate: async () => null },
    "./restaurant-verification": { ...verification, verifyAndRankRestaurants: async items => items.map(item => ({ ...item,
      website: item.name === 'Juniper Table' ? 'https://junipertable.co.uk/' : '',
      locationConfirmed: item.name === 'Juniper Table', foodConfirmed: item.name === 'Juniper Table',
    })) },
  }, { process: { env: { OPENROUTER_API_KEY: 'test', OPENROUTER_MODEL: 'primary:free' } }, console: { error() {} },
    fetch: async (_url, options) => {
      const request = JSON.parse(options.body);
      if (request.model === 'primary:free') return Response.json({ error: { metadata: { limit_source: 'upstream_provider_shared_pool' } } }, { status: 429 });
      fallbackPrompt = request.messages[0].content;
      assert.deepEqual(JSON.parse(request.messages[1].content).suggestions, ['Juniper Table']);
      return Response.json({ choices: [{ message: { content: JSON.stringify({ p: [
        { n: 'Juniper Table', city: 'London', w: 'https://junipertable.co.uk/' },
        { n: 'Invented Kitchen', city: 'London', w: 'https://inventedkitchen.co.uk/' },
      ] }) } }] });
    },
  });
  const result = await loaded.discoverRestaurantsWithOpenRouter({ ...input, suggestedRestaurants: ['Juniper Table'] });
  assert.match(fallbackPrompt, /research leads/);
  assert.deepEqual(result.restaurants.map(item => item.name), ['Juniper Table']);
});

test("public-search challenges cause a cooldown instead of repeated challenge requests", async () => {
  let alternateRequests = 0;
  const { searchPublicSources } = loadTsModule('app/lib/restaurant-web-search.ts', {
    './public-web': { ...loadTsModule('app/lib/public-web.ts'), fetchPublicPage: async url => {
      if (url.includes('duckduckgo')) { alternateRequests++; return { url, html: '<p>Unfortunately, bots use DuckDuckGo too.</p>' }; }
      return { url, html: '<rss><channel></channel></rss>' };
    } },
  });
  assert.deepEqual(await searchPublicSources('London gluten-free burgers'), []);
  assert.deepEqual(await searchPublicSources('Paris gluten-free burgers'), []);
  assert.equal(alternateRequests, 1);
});
