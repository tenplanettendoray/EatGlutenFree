import assert from "node:assert/strict";
import test from "node:test";
import { loadTsModule as loadRawModule } from "./load-ts-module.mjs";

const webSearch = loadRawModule("app/lib/restaurant-web-search.ts");
const verification = loadRawModule("app/lib/restaurant-verification.ts");
const evidence = loadRawModule("app/lib/restaurant-evidence.ts");
// These parser/provider tests isolate website verification. Separate regression
// tests below exercise rejection using unverified candidates and actual sources.
function loadTsModule(path, mocks, globals) {
  const verify = mocks["./restaurant-verification"]?.verifyAndRankRestaurants;
  return loadRawModule(path, {
    ...mocks,
    "./restaurant-web-search": { ...webSearch, ...mocks["./restaurant-web-search"] },
    "./restaurant-verification": { ...verification, ...(verify ? { verifyAndRankRestaurants: async (...args) => (await verify(...args)).map(item => ({ ...item, locationConfirmed: true, foodConfirmed: true })) } : {}) },
    "./restaurant-evidence": { ...evidence, verifyRestaurantCandidate: async candidate => ({ name: candidate.n, website: candidate.w, supportedAllergies: [], locations: [], qualitySourceUrl: candidate.w }) },
  }, globals);
}

test("discovery retains more than nine candidates without inventing website buttons", async () => {
  const names = ["Juniper Table", "Cedar Kitchen", "Maple Diner", "Willow Grill", "Oak House", "Birch Bistro", "Elm Kitchen", "Olive Table", "Pine Diner", "Rose Table", "Lemon Grove", "Hazel Kitchen"];
  const calls = [];
  const loaded = loadTsModule("app/lib/openrouter-discovery.ts", {
    "./restaurant-web-search": { searchRestaurantSources: async () => [], searchRestaurantWebsites: async () => [] },
    "./restaurant-verification": { verifyAndRankRestaurants: async restaurants => restaurants },
  }, {
    process: { env: { OPENROUTER_API_KEY: "sk-or-v1-test" } },
    fetch: async (url, options) => {
      calls.push(url);
      const body = JSON.parse(options.body);
      assert.equal(body.reasoning.enabled, false);
      assert.ok(body.max_tokens >= 3000);
      if (body.tools) { assert.equal(body.tools[0].type, "openrouter:web_search"); assert.equal(body.tools.length, 1); }
      return Response.json({ choices: [{ message: { content: JSON.stringify({ p: names.map(n => ({ n, a: "Paris", c: ["Burgers"], e: "May offer gluten-free buns; verify current status", sa: [], ma: ["Gluten"] })) }) } }] });
    },
  });
  const result = await loaded.discoverRestaurantsWithOpenRouter({ location: "Paris", food: "Burgers", allergies: ["Gluten"] });
  assert.equal(result.restaurants.length, 12);
  assert.equal(result.provider, "OpenRouter");
  assert.ok(result.restaurants.every(item => item.website === "" && item.menuSourceUrl === ""));
  assert.ok(result.restaurants.every(item => item.locations[0].sourceUrl.includes("google.com/maps/search")));
  assert.deepEqual(calls, ["https://openrouter.ai/api/v1/chat/completions"]);
});

test("the model receives only a city and wrong-city branches are excluded and duplicate brands grouped", async () => {
  let sent;
  const loaded = loadTsModule("app/lib/openrouter-discovery.ts", {
    "./restaurant-web-search": { searchRestaurantSources: async () => [], searchRestaurantWebsites: async () => [], searchPublicSources: async () => [] },
    "./restaurant-verification": { verifyAndRankRestaurants: async restaurants => restaurants },
  }, {
    process: { env: { OPENROUTER_API_KEY: "sk-or-v1-test" } },
    fetch: async (_url, options) => {
      sent = JSON.parse(JSON.parse(options.body).messages[1].content);
      return Response.json({ choices: [{ message: { content: JSON.stringify({ p: [
        { n: "Juniper Table - Centre", city: "Paris", a: "1 Example Street, Paris", pt: 5 },
        { n: "Juniper Table - Riverside", city: "Paris", a: "2 Example Street, Paris", pt: 5 },
        { n: "Cedar Kitchen", city: "London", a: "London", pt: 5 },
      ] }) } }] });
    },
  });
  const result = await loaded.discoverRestaurantsWithOpenRouter({ location: "Paris, France", latitude: 48.8, longitude: 2.3, food: "burgers", allergies: ["Gluten"] });
  assert.equal(sent.loc, "Paris");
  assert.equal(JSON.stringify(sent).includes("France"), false);
  assert.equal(JSON.stringify(sent).includes("48.8"), false);
  assert.equal(result.restaurants.length, 1);
  assert.equal(result.restaurants[0].locations.length, 2);
});

test("research citations survive JSON formatting and unsupported popularity stays low", async () => {
  const source = { url: "https://junipertable.it/", title: "Juniper Table, Rome", content: "Juniper Table is a popular restaurant in Rome." };
  const loaded = loadTsModule("app/lib/openrouter-discovery.ts", {
    "./restaurant-web-search": { searchRestaurantSources: async () => [], searchPublicSources: async () => [] },
    "./restaurant-verification": { verifyAndRankRestaurants: async restaurants => restaurants },
  }, {
    process: { env: { OPENROUTER_API_KEY: "sk-or-v1-test" } },
    fetch: async (_url, options) => {
      const body = JSON.parse(options.body);
      if (body.response_format) {
        assert.equal(body.reasoning.enabled, false);
        return Response.json({ choices: [{ message: { content: JSON.stringify({ p: [
        { n: "Juniper Table", city: "Rome", pt: 4, ps: source.url },
        { n: "Cedar Kitchen", city: "Rome", pt: 5, ps: "https://unobserved-ranking.it/" },
      ] }) } }] });
      }
      return Response.json({ choices: [{ message: { content: "Juniper Table in Rome has public popularity evidence.", annotations: [{ url_citation: source }] } }] });
    },
  });
  const result = await loaded.discoverRestaurantsWithOpenRouter({ location: "Rome", food: "", allergies: ["Gluten"] });
  assert.equal(result.restaurants.find(item => item.name === "Juniper Table").popularityTier, 4);
  assert.equal(result.restaurants.find(item => item.name === "Cedar Kitchen").popularityTier, 1);
});

test("an OpenRouter rate limit does not retry another model on the same exhausted account", async () => {
  const calls = [];
  const loaded = loadTsModule("app/lib/openrouter-discovery.ts", {
    "./restaurant-web-search": { searchRestaurantSources: async () => [] },
  }, {
    process: { env: { OPENROUTER_API_KEY: "sk-or-v1-test", OPENROUTER_MODEL: "configured:free" } },
    fetch: async (_url, options) => { calls.push(JSON.parse(options.body).model); return new Response("Daily model quota exceeded", { status: 429 }); },
    console: { error() {} },
  });
  const result = await loaded.discoverRestaurantsWithOpenRouter({ location: "Rome", food: "", allergies: [] });
  assert.equal(result.status, "quota");
  assert.equal(calls.length, 1);
  assert.equal(calls.includes("openrouter/free"), false);
});

test("OpenRouter quota can fall back to public source candidates", async () => {
  const loaded = loadTsModule("app/lib/openrouter-discovery.ts", {
    "./restaurant-web-search": {
      searchRestaurantSources: async () => [{
        title: "Bareburger official menu",
        url: "https://www.bareburger.com/",
        snippet: "Bareburger New York restaurant with gluten free buns and burger reviews",
        links: [{ title: "Friedman's Restaurant", url: "https://www.friedmansrestaurant.com/" }],
      }],
      searchPublicSources: async () => [],
    },
    "./restaurant-verification": { verifyAndRankRestaurants: async restaurants => restaurants },
  }, {
    process: { env: { GOOGLE_API_KEY: "quota-test" } },
    console: { error() {} },
    fetch: async () => new Response("Daily model quota exceeded", { status: 429 }),
  });
  const result = await loaded.discoverRestaurantsWithOpenRouter({ location: "Boston", food: "Burgers", allergies: ["Gluten"] });
  assert.equal(result.status, "used");
  assert.equal(result.provider, "Public web fallback");
  assert.deepEqual(result.restaurants.map(item => item.name), ["Bareburger", "Friedman's Restaurant"]);
  assert.match(result.searchWarning, /quota/i);
});

test("Paris burger quota fallback includes reviewed and suggested restaurants", async () => {
  const loaded = loadTsModule("app/lib/openrouter-discovery.ts", {
    "./restaurant-web-search": { searchRestaurantSources: async () => [], searchPublicSources: async () => [] },
    "./restaurant-verification": { verifyAndRankRestaurants: async restaurants => restaurants },
  }, {
    process: { env: { GOOGLE_API_KEY: "quota-test" } },
    console: { error() {} },
    fetch: async () => new Response("Daily model quota exceeded", { status: 429 }),
  });
  const result = await loaded.discoverRestaurantsWithOpenRouter({ location: "Paris", food: "Burgers", allergies: ["Gluten"], suggestedRestaurants: ["PNY"] });
  assert.equal(result.status, "used");
  assert.equal(result.provider, "Public web fallback");
  assert.ok(result.restaurants.length >= 3);
  assert.ok(result.restaurants.some(item => item.name === "PNY" && item.website === "https://www.pnyburger.com/"));
});

test("search defaults to the configured Google OpenRouter model", async () => {
  let model;
  let authorization;
  const loaded = loadTsModule("app/lib/openrouter-discovery.ts", {
    "./restaurant-web-search": { searchRestaurantSources: async () => [], searchPublicSources: async () => [] },
    "./restaurant-verification": { verifyAndRankRestaurants: async restaurants => restaurants },
  }, {
    process: { env: { GOOGLE_API_KEY: "google-env-key", OPENROUTER_API_KEY: "openrouter-env-key" } },
    fetch: async (_url, options) => {
      model = JSON.parse(options.body).model;
      authorization = options.headers.Authorization;
      return Response.json({ choices: [{ message: { content: JSON.stringify({ p: [{ n: "Juniper Table", city: "Rome" }] }) } }] });
    },
  });
  const result = await loaded.discoverRestaurantsWithOpenRouter({ location: "Rome", food: "", allergies: [] });
  assert.equal(model, "google/gemma-4-26b-a4b-it:free");
  assert.equal(authorization, "Bearer openrouter-env-key");
  assert.equal(result.status, "used");
});

test("a retired configured model falls back with a full research timeout", async () => {
  const models = [], timeouts = [];
  const loaded = loadTsModule("app/lib/openrouter-discovery.ts", {
    "./restaurant-web-search": { searchRestaurantSources: async () => [], searchPublicSources: async () => [] },
    "./restaurant-verification": { verifyAndRankRestaurants: async restaurants => restaurants },
  }, {
    process: { env: { OPENROUTER_API_KEY: "sk-or-v1-test", OPENROUTER_MODEL: "retired:free" } },
    AbortSignal: { timeout(ms) { timeouts.push(ms); return AbortSignal.timeout(ms); } },
    console: { error() {} },
    fetch: async (_url, options) => {
      const model = JSON.parse(options.body).model;
      models.push(model);
      if (model === "retired:free") return Response.json({ error: { message: "Model removed" } }, { status: 404 });
      return Response.json({ choices: [{ message: { content: JSON.stringify({ p: [{ n: "Juniper Table", city: "Rome" }] }) } }] });
    },
  });
  const result = await loaded.discoverRestaurantsWithOpenRouter({ location: "Rome", food: "", allergies: [] });
  assert.equal(result.status, "used");
  assert.deepEqual(models, ["retired:free", "liquid/lfm-2.5-2.6b:free"]);
  assert.ok(timeouts[1] <= 45000 && timeouts[1] > 0);
});

for (const [httpStatus, expected] of [[401, "authentication"], [403, "authentication"], [402, "credits"]]) {
  test(`OpenRouter ${httpStatus} reports an actionable account error without retrying`, async () => {
    let calls = 0;
    const loaded = loadTsModule("app/lib/openrouter-discovery.ts", {
      "./restaurant-web-search": { searchRestaurantSources: async () => [] },
    }, {
      process: { env: { OPENROUTER_API_KEY: "sk-or-v1-test", OPENROUTER_MODEL: "configured" } },
      console: { error() {} },
      fetch: async () => { calls++; return Response.json({ error: { message: "Account issue" } }, { status: httpStatus }); },
    });
    const result = await loaded.discoverRestaurantsWithOpenRouter({ location: "Rome", food: "", allergies: [] });
    assert.equal(result.status, expected);
    assert.equal(calls, 1);
  });
}

test("existing public sources need only one JSON request without a web tool", async () => {
  const requests = [];
  const loaded = loadTsModule("app/lib/openrouter-discovery.ts", {
    "./restaurant-web-search": { searchRestaurantSources: async () => [{ title: "Juniper Table Rome", url: "https://example.org/menu", snippet: "Juniper Table restaurant in Rome" }], searchPublicSources: async () => [] },
    "./restaurant-verification": { verifyAndRankRestaurants: async restaurants => restaurants },
  }, {
    process: { env: { OPENROUTER_API_KEY: "sk-or-v1-test" } },
    console: { error() {} },
    fetch: async (_url, options) => {
      const body = JSON.parse(options.body); requests.push(body);
      if (body.tools) return Response.json({ error: { message: 'Server tool "openrouter:web_search" failed' } }, { status: 503 });
      assert.equal(body.model, "google/gemma-4-26b-a4b-it:free");
      assert.equal(body.response_format.type, "json_object");
      assert.equal(body.reasoning.exclude, true);
      assert.equal(JSON.parse(body.messages[1].content).webSources.length, 1);
      return Response.json({ choices: [{ message: { content: JSON.stringify({ p: [{ n: "Juniper Table", city: "Rome" }] }) } }] });
    },
  });
  const result = await loaded.discoverRestaurantsWithOpenRouter({ location: "Rome", food: "", allergies: [] });
  assert.equal(result.status, "used");
  assert.equal(requests.length, 1);
  assert.equal(requests[0].tools, undefined);
});
