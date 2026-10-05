import assert from "node:assert/strict";
import test from "node:test";
import { loadTsModule } from "./load-ts-module.mjs";

test("cached guide results use live stars and hearts, and retain saved recommendations omitted by AI", async () => {
  const { cityGuideRestaurants } = loadTsModule('app/lib/city-guide.ts');
  const preferences = [];
  const ratings = [];
  const preferenceTable = {};
  const ratingTable = { restaurantKey: 'key', stars: 'stars' };
  let cached = null;
  let calls = 0;
  const route = loadTsModule('app/api/restaurants/route.ts', {
    'next/server': { NextResponse: { json: (data, options) => ({ data, status: options?.status || 200, cookies: { set() {} } }) } },
    '../../lib/guided-discovery': { discoverRestaurants: async input => { calls++; return { status: 'used', provider: 'City guide', locationLabel: input.location, restaurants: cityGuideRestaurants(input) }; } },
    '@/app/lib/premium': { getAccountAccess: async () => ({ whitelisted: true, premium: true }) },
    '@/app/lib/restaurant-result-validation': loadTsModule('app/lib/restaurant-result-validation.ts'),
    '@/app/lib/search-cache': { restaurantSearchCacheKey: async () => 'test', readRestaurantSearchCache: async () => cached, writeRestaurantSearchCache: async (_key, _mode, value) => { cached = value; } },
    '@/app/lib/user-searches': { recordUserSearch: async () => {} },
    '../../../db/schema': { restaurantPreference: preferenceTable, restaurantRating: ratingTable },
    '../../../db': { getDb: () => ({ select: () => ({ from: table => table === preferenceTable ? Promise.resolve(preferences) : { where: async () => ratings } }) }) },
    'drizzle-orm': { inArray: () => true },
    '../../lib/auth': { auth: { api: { getSession: async () => null } } },
  });
  const request = () => ({ headers: new Headers(), cookies: { get() {} }, nextUrl: new URL('http://localhost/api/restaurants?location=New%20York&food=Burgers&allergies=Gluten&mode=free') });
  assert.equal((await route.GET(request())).data.restaurants[0].name, 'Bareburger');
  const vote = name => ({ name, normalizedName: name.toLowerCase(), kind: 'suggest', locationScope: 'new york', foodScope: 'burgers', allergyScope: 'gluten' });
  preferences.push(vote("Friedman's"), vote("Friedman's"), vote('Quiet Local Kitchen'));
  ratings.push({ key: 'friedman s|new york', stars: 5 });
  const changed = (await route.GET(request())).data;
  assert.equal(changed.cacheStatus, 'hit');
  assert.equal(calls, 1);
  assert.equal(changed.restaurants[0].name, "Friedman's");
  assert.equal(changed.restaurants[0].communityRating, 5);
  assert.equal(changed.restaurants[0].suggestionCount, 2);
  assert.equal(changed.restaurants.filter(item => item.guideRank).length, 5);
  const recommendation = changed.restaurants.find(item => item.name === 'Quiet Local Kitchen');
  assert.ok(recommendation);
  assert.equal(changed.restaurants.indexOf(recommendation), 5);
  assert.deepEqual(recommendation.supportedAllergies, []);
  assert.equal(recommendation.website, '');
});

test("search API uses OpenRouter and preserves coordinates and evidence", async () => {
  let discoveryInput;
  let cacheInput;
  let discoveryCalls = 0;
  const names = ["Juniper Table", "Cedar Kitchen", "Maple Diner", "Willow Grill", "Oak House", "Five Guys", "Burger King", "Market Kitchen", "Uncertain Bistro"];
  const restaurants = names.map((name, index) => ({
    name, cuisine: ["Burgers"], website: "", websiteStatus: "unverified", menuSourceUrl: "", qualitySourceUrl: "https://www.google.com/maps/search/?api=1&query=Paris",
    evidenceSummary: "Needs confirmation", popularitySummary: "Unconfirmed", rankingReason: "Potential match",
    supportedAllergies: index < 5 ? ["Gluten"] : [], missingAllergies: index < 5 ? [] : ["Gluten"],
    locations: [{ label: "Paris", address: "Paris, France", website: "", sourceUrl: "https://www.google.com/maps/search/?api=1&query=Paris" }],
  }));
  const route = loadTsModule("app/api/restaurants/route.ts", {
    "next/server": { NextResponse: { json: (data, options) => ({ data, status: options?.status || 200, cookies: { set() {} } }) } },
    "../../lib/guided-discovery": { discoverRestaurants: async input => { discoveryCalls++; discoveryInput = input; return { status: "used", provider: "OpenRouter", model: "test", locationLabel: input.location, restaurants }; } },
    "@/app/lib/foursquare-enrichment": { enrichRestaurantsWithFoursquare: async restaurants => restaurants, discoverFoursquareFallback: async () => [] },
    "@/app/lib/premium": { getAccountAccess: async () => ({ whitelisted: true, premium: true }) },
    "@/app/lib/community-ranking": loadTsModule("app/lib/community-ranking.ts"),
    "@/app/lib/restaurant-result-validation": loadTsModule("app/lib/restaurant-result-validation.ts"),
    "@/app/lib/search-cache": {
      restaurantSearchCacheKey: async input => { cacheInput = input; return "test"; },
      readRestaurantSearchCache: async () => null,
      writeRestaurantSearchCache: async () => {},
    },
    "@/app/lib/user-searches": { recordUserSearch: async () => {} },
    "../../../db": { getDb: () => ({ select: () => ({ from: async () => [] }) }) },
    "../../../db/schema": { restaurantPreference: {} },
    "../../lib/auth": { auth: { api: { getSession: async () => null } } },
  });
  const response = await route.GET({ headers: new Headers(), cookies: { get() {} }, nextUrl: new URL("https://app.test/api/restaurants?location=Paris%2C%20France&food=burgers&allergies=Gluten&mode=premium&latitude=48.8566&longitude=2.3522") });
  assert.equal(response.status, 200);
  assert.equal(discoveryInput.location, "Paris");
  assert.equal(cacheInput.location, "Paris");
  assert.equal(discoveryInput.latitude, 48.8566);
  assert.equal(discoveryInput.longitude, 2.3522);
  assert.equal(response.data.restaurants.length, 9);
  assert.deepEqual(response.data.restaurants.slice(0, 5).map(item => item.name), ["PNY", "Noglu", "Little Apple", "Apéti", "Tasty Burger"]);
  assert.equal(response.data.restaurants.filter(item => item.guideRank).length, 5);
  assert.ok(response.data.restaurants.every(item => item.website === "" && item.menuSourceUrl === "" && item.sourceUrl.includes("google.com/maps/search")));
  const freeResponse = await route.GET({ headers: new Headers(), cookies: { get() {} }, nextUrl: new URL("https://app.test/api/restaurants?location=Paris&food=burgers&allergies=Gluten&mode=free") });
  assert.equal(freeResponse.status, 200);
  assert.equal(freeResponse.data.restaurants.length, 9);
  assert.equal(freeResponse.data.lockedResultCount, 0);

  const before = discoveryCalls;
  const concurrent = await Promise.all(["free", "premium"].map(mode => route.GET({
    headers: new Headers(), cookies: { get() {} },
    nextUrl: new URL(`https://app.test/api/restaurants?location=Paris&food=burgers&allergies=Gluten&mode=${mode}`),
  })));
  assert.equal(discoveryCalls - before, 1, "simultaneous identical public searches share one AI request");
  assert.equal(concurrent[0].data.mode, "free");
  assert.equal(concurrent[1].data.mode, "premium");
  assert.equal(concurrent[0].data.restaurants[0].source, "free");
  assert.equal(concurrent[1].data.restaurants[0].source, "ai");

});

test("an exhausted OpenRouter account falls back to an expired matching search", async () => {
  const preferenceTable = {};
  const ratingTable = { restaurantKey: "key", stars: "stars" };
  let cacheReads = 0;
  let discoveryCalls = 0;
  const saved = {
    location: "Rome",
    mode: "premium",
    agentQuery: "Rome · steak · Gluten",
    aiProvider: "OpenRouter",
    aiModel: "saved-model",
    premiumFallback: false,
    restaurants: [{
      id: "saved-rome-pizza",
      discoveryRank: 0,
      name: "Saved Trattoria",
      cuisine: ["Pizza"],
      address: "Rome",
      source: "ai",
      sourceUrl: "https://www.google.com/maps/search/?api=1&query=Saved%20Trattoria%20Rome",
      website: "",
      rankingReason: "Previously researched match.",
      supportedAllergies: ["Gluten"],
      missingAllergies: [],
      locations: [{ label: "Rome", address: "Rome", website: "", sourceUrl: "https://www.google.com/maps/search/?api=1&query=Saved%20Trattoria%20Rome" }],
    }],
  };
  const route = loadTsModule("app/api/restaurants/route.ts", {
    "next/server": { NextResponse: { json: (data, options) => ({ data, status: options?.status || 200, cookies: { set() {} } }) } },
    "../../lib/guided-discovery": { discoverRestaurants: async () => { discoveryCalls++; return { status: "credits", restaurants: [] }; } },
    "@/app/lib/premium": { getAccountAccess: async () => ({ whitelisted: true, premium: true }) },
    "@/app/lib/restaurant-result-validation": loadTsModule("app/lib/restaurant-result-validation.ts"),
    "@/app/lib/search-cache": {
      restaurantSearchCacheKey: async () => "saved-query",
      readRestaurantSearchCache: async (_key, options) => { cacheReads++; return options?.allowStale ? saved : null; },
      writeRestaurantSearchCache: async () => {},
    },
    "@/app/lib/user-searches": { recordUserSearch: async () => {} },
    "../../../db/schema": { restaurantPreference: preferenceTable, restaurantRating: ratingTable },
    "../../../db": { getDb: () => ({ select: () => ({ from: table => table === preferenceTable ? Promise.resolve([]) : { where: async () => [] } }) }) },
    "drizzle-orm": { inArray: () => true },
    "../../lib/auth": { auth: { api: { getSession: async () => null } } },
  });
  const response = await route.GET({
    headers: new Headers(), cookies: { get() {} },
    nextUrl: new URL("https://app.test/api/restaurants?location=Rome&food=steak&allergies=Gluten&mode=premium"),
  });
  assert.equal(response.status, 200);
  assert.equal(response.data.cacheStatus, "stale");
  assert.equal(response.data.aiProvider, "Saved search");
  assert.match(response.data.searchWarning, /latest saved results/i);
  assert.deepEqual(response.data.restaurants.map(item => item.name), ["Saved Trattoria"]);
  assert.equal(cacheReads, 2);
  assert.equal(discoveryCalls, 1);
});
