import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { loadTsModule } from "./load-ts-module.mjs";

const { cityGuideRestaurants, mergeGuideRestaurants } = loadTsModule("app/lib/city-guide.ts");
const { applyCommunityPreferences, createCommunityRestaurant, visibleRestaurantResults } = loadTsModule("app/lib/community-preferences.ts");
const input = { location: "Paris", food: "burgers", allergies: ["Gluten"] };
const cards = restaurants => restaurants.map((restaurant, index) => ({ ...restaurant, id: `result-${index}`, discoveryRank: index, communityRating: null }));

test("all 40 cities and 1,560 ranked placements preserve the supplied default order", () => {
  const guide = JSON.parse(readFileSync("app/lib/data/gluten-free-city-guide.json", "utf8"));
  assert.equal(guide.cities.length, 40);
  let count = 0;
  for (const city of guide.cities) {
    for (const [key, food] of [["B", "burgers"], ["C", "chicken"], ["D", "desserts"], ["N", "noodles"], ["P", "pizza"], ["S", "sushi"]]) {
      const results = cityGuideRestaurants({ ...input, location: city.city, food });
      count += results.length;
      assert.deepEqual(results.map(item => item.guideName), city.categories[key].map(item => item.name));
      assert.deepEqual(applyCommunityPreferences(cards(results), []).map(item => item.name), results.map(item => item.name));
    }
    for (const [key, allergy] of [["ML", "Milk"], ["PN", "Peanut"], ["SF", "Shellfish"]]) {
      const results = cityGuideRestaurants({ ...input, location: city.city, allergies: [allergy] });
      count += results.length;
      assert.deepEqual(results.map(item => item.guideName), city.allergyCategories[key].map(item => item.name));
    }
  }
  assert.equal(count, 1560);
});

test("city aliases match while uncovered meals and allergy combinations use AI", () => {
  const ny = cityGuideRestaurants({ ...input, location: "New York City" }).map(item => item.name);
  for (const location of ["New York", "NYC", "New York City, United States"]) assert.deepEqual(cityGuideRestaurants({ ...input, location }).map(item => item.name), ny);
  assert.equal(cityGuideRestaurants({ ...input, location: "Roma", food: "Pizza" }).length, 5);
  assert.equal(cityGuideRestaurants({ ...input, location: "Paris", food: "sushi" }).length, 5);
  assert.equal(cityGuideRestaurants({ ...input, location: "Paris", allergies: ["Milk"] }).length, 3);
  for (const change of [{ location: "Manchester" }, { food: "vegan burger" }, { food: "pizza and burgers" }, { food: "" }, { allergies: [] }, { allergies: ["Egg"] }, { allergies: ["Gluten", "Milk"] }]) {
    assert.deepEqual(cityGuideRestaurants({ ...input, ...change }), []);
  }
});

test("guide labels set evidence strength without inventing star ratings", () => {
  const paris = cityGuideRestaurants(input);
  assert.equal(paris.find(item => item.name === "Apéti").guideLabel, "?");
  assert.match(paris.find(item => item.name === "Apéti").evidenceSummary, /unconfirmed/);
  assert.ok(paris.every(item => item.website === "" && item.supportedAllergies.includes("Gluten") && !item.rating));
});

test("guide picks lead, equivalent brands merge, and the remaining slots use distinct AI results", () => {
  const guide = cityGuideRestaurants(input);
  const extra = Array.from({ length: 7 }, (_, i) => ({ ...guide[0], name: `Extra Bistro ${i}`, guideRank: undefined, popularityTier: 5, evidenceRank: 5 }));
  const merged = mergeGuideRestaurants(guide, [{ ...extra[0], name: "PNY Pigalle", website: "https://www.pnyburger.com/" }, { ...extra[0], name: "No Glu" }, ...extra]);
  assert.equal(merged.length, 9);
  assert.deepEqual(merged.slice(0, 5).map(item => item.name), ["PNY", "Noglu", "Little Apple", "Apéti", "Tasty Burger"]);
  assert.equal(merged.filter(item => /pny/i.test(item.name)).length, 1);
  assert.equal(merged.filter(item => /noglu/i.test(item.name)).length, 1);
  assert.ok(merged.slice(5).every(item => item.name.startsWith("Extra Bistro")));
});

test("reactions strongly reorder guide peers while guide entries stay ahead of AI additions", () => {
  const paris = cards(mergeGuideRestaurants(cityGuideRestaurants(input), []));
  paris[0].communityRating = 5;
  const popular = { ...paris[0], id: 'ai-extra', name: 'Popular Extra', guideRank: undefined, popularityTier: 5, evidenceRank: 5, communityRating: 5 };
  const votes = [{ kind: 'suggest', name: 'Pny', count: 2 }, { kind: 'suggest', name: 'Popular Extra', count: 100 }];
  const ranked = applyCommunityPreferences([...paris, popular], votes);
  assert.equal(ranked[0].name, 'PNY');
  assert.equal(ranked[0].suggestionCount, 2);
  assert.equal(ranked[5].name, 'Popular Extra');
  assert.equal(ranked.filter(item => item.guideRank).length, 5);
  const ny = cards(cityGuideRestaurants({ ...input, location: 'New York' }));
  const friedmans = ny.find(item => item.name === "Friedman's");
  assert.equal(friedmans.guideRank, 4);
  friedmans.communityRating = 5;
  assert.equal(applyCommunityPreferences(ny, [{ kind: 'suggest', name: "Friedman's", count: 2 }])[0].name, "Friedman's");
  friedmans.communityRating = null;
  assert.equal(applyCommunityPreferences(ny, [])[0].name, 'Bareburger');
});

test("saved recommendations absent from AI remain visible beyond the ordinary cutoff", () => {
  const candidates = Array.from({ length: 14 }, (_, i) => ({ id: `ai-${i}`, name: `Restaurant ${i}`, popularityTier: 5, discoveryRank: i }));
  const ranked = applyCommunityPreferences(candidates, [{ kind: 'suggest', name: 'Quiet Local Kitchen', count: 1 }], (name, index) => createCommunityRestaurant(name, index, { ...input, mode: 'free' }));
  const visible = visibleRestaurantResults(ranked);
  assert.ok(visible.some(item => item.name === 'Quiet Local Kitchen'));
  assert.equal(visible.find(item => item.name === 'Quiet Local Kitchen').supportedAllergies.length, 0);
});

test("the guide remains available through an AI outage; uncovered searches reach AI unchanged", async () => {
  const calls = [];
  const service = loadTsModule('app/lib/guided-discovery.ts', {
    './restaurant-verification': { verifyAndRankRestaurants: async () => [] },
    './restaurant-evidence': { reviewedCandidates: () => [] },
    './openrouter-discovery': { discoverRestaurantsWithOpenRouter: async value => { calls.push(value); return { status: 'quota', restaurants: [] }; } },
  });
  const result = await service.discoverRestaurants(input);
  assert.equal(result.status, 'used');
  assert.equal(result.restaurants.length, 5);
  assert.deepEqual(calls[0].excludedRestaurants, ['PNY', 'Noglu', 'Little Apple', 'Apéti', 'Tasty Burger']);
  const unsupported = { ...input, food: 'steak' };
  assert.equal((await service.discoverRestaurants(unsupported)).status, 'quota');
  assert.deepEqual(calls[1], unsupported);
});
