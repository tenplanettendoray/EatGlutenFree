import assert from "node:assert/strict";
import test from "node:test";
import { loadTsModule } from "./load-ts-module.mjs";

const context = { location: "Paris, France", food: "burgers", allergies: ["Gluten"] };
const columns = Object.fromEntries(["id", "userId", "kind", "name", "normalizedName", "locationScope", "allergyScope", "foodScope", "createdAt", "updatedAt"].map(key => [key, key]));

function preference(overrides = {}) {
  return {
    id: crypto.randomUUID(), userId: "other-user", kind: "suggest", name: "Juniper Table", normalizedName: "juniper table",
    locationScope: "paris france", foodScope: "burgers", allergyScope: "gluten", ...overrides,
  };
}

function fixture(initialRows = [], options = {}) {
  const rows = initialRows.map(row => ({ ...row }));
  const signals = [];
  let userId = "current-user";
  let premium = true;
  process.env.OPENROUTER_API_KEY = options.aiProfile ? "sk-or-v1-test" : "";
  const db = {
    select(projection) {
      return { from() {
        let predicate = () => true;
        let maximum = Infinity;
        const query = {
          where(value) { predicate = value; return query; },
          limit(value) { maximum = value; return query; },
          then(resolve, reject) {
            const selected = rows.filter(predicate).slice(0, maximum).map(row => projection
              ? Object.fromEntries(Object.entries(projection).map(([key, column]) => [key, row[column]]))
              : { ...row });
            return Promise.resolve(selected).then(resolve, reject);
          },
        };
        return query;
      } };
    },
    insert() {
      return { values(value) {
        return { async onConflictDoUpdate({ target, set }) {
          const existing = rows.find(row => target.every(column => row[column] === value[column]));
          if (existing) Object.assign(existing, set);
          else rows.push({ ...value });
        } };
      } };
    },
    delete() {
      return { async where(predicate) {
        for (let index = rows.length - 1; index >= 0; index--) if (predicate(rows[index])) rows.splice(index, 1);
      } };
    },
  };
  const route = loadTsModule("app/api/suggestions/route.ts", {
    "drizzle-orm": {
      eq: (column, value) => row => row[column] === value,
      and: (...predicates) => row => predicates.every(predicate => predicate(row)),
      inArray: (column, values) => row => values.includes(row[column]),
    },
    "next/server": { NextResponse: { json: (data, options) => ({ data, status: options?.status || 200, cookies: { set() {} } }) } },
    "@/app/lib/restaurant-signals": { incrementRestaurantSignals: async changes => signals.push(...changes) },
    "@/app/lib/premium": { getAccountAccess: async () => ({ premium }) },
    "@/app/lib/restaurant-verification": { verifyAndRankRestaurants: async restaurants => restaurants.map(restaurant => ({
      ...restaurant,
      websiteStatus: restaurant.website ? "verified" : "missing",
      checkedAt: "2026-09-18T00:00:00.000Z",
      allergenEvidence: restaurant.supportedAllergies.map(allergy => ({ allergy, quote: `${allergy}-free`, url: restaurant.website || restaurant.qualitySourceUrl })),
      locations: restaurant.locations.map(location => ({ ...location, website: restaurant.website })),
    })) },
    "../../../db": { getDb: () => db },
    "../../../db/schema": { restaurantPreference: columns },
    "../../lib/auth": { auth: { api: { getSession: async () => userId ? { user: { id: userId } } : null } } },
  }, {
    fetch: async () => {
      if (!options.aiProfile) throw new Error("Unexpected external service call");
      return new Response(JSON.stringify({
        choices: [{ message: { content: JSON.stringify(options.aiProfile) } }],
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    },
  });
  function request(body, searchContext = context) {
    const url = new URL("https://app.test/api/suggestions");
    for (const [key, value] of Object.entries(searchContext)) url.searchParams.set(key, Array.isArray(value) ? value.join("|") : value);
    return { headers: new Headers(), nextUrl: url, cookies: { get() {} }, json: async () => body };
  }
  return {
    rows, signals,
    get: (searchContext = context) => route.GET(request(undefined, searchContext)),
    post: (body, searchContext = context) => route.POST(request(body, searchContext)),
    remove: (body, searchContext = context) => route.DELETE(request(body, searchContext)),
    setUser(value) { userId = value; },
    setPremium(value) { premium = value; },
  };
}

test("saving a recommendation can return AI-checked restaurant details for the card", async () => {
  const api = fixture([], {
    aiProfile: {
      compatible: true,
      confidence: "medium",
      supportedAllergies: ["Gluten"],
      unsupportedAllergies: [],
      unknownAllergies: [],
      reason: "The restaurant publishes gluten-free options, with cross-contact still requiring staff confirmation.",
      name: "Juniper Table",
      branch: "Paris",
      address: "12 Rue Test, Paris",
      cuisine: ["Burgers", "Gluten-free"],
      website: "https://junipertable.example",
      menuSourceUrl: "https://junipertable.example/menu",
      popularitySummary: "AI checked as a real local restaurant lead.",
      rankingReason: "Recommended by the community and verified against the request.",
    },
  });
  const saved = await api.post({ name: "Juniper Table", kind: "suggest" });
  assert.equal(saved.status, 200);
  assert.equal(saved.data.feedbackTone, "favorable");
  assert.equal(saved.data.verifiedRestaurants.length, 1);
  assert.equal(saved.data.verifiedRestaurants[0].name, "Juniper Table");
  assert.equal(saved.data.verifiedRestaurants[0].website, "https://junipertable.example");
  assert.equal(saved.data.verifiedRestaurants[0].address, "12 Rue Test, Paris");
  assert.deepEqual(saved.data.verifiedRestaurants[0].supportedAllergies, ["Gluten"]);
});

test("a high-confidence fake or incompatible recommendation is blocked before saving", async () => {
  const api = fixture([], {
    aiProfile: {
      compatible: false,
      confidence: "high",
      supportedAllergies: [],
      unsupportedAllergies: ["Gluten"],
      unknownAllergies: [],
      reason: "This is not a restaurant for the requested location and has no gluten-free support.",
      name: "Fake Table",
      cuisine: [],
      website: "",
    },
  });
  const saved = await api.post({ name: "Fake Table", kind: "suggest" });
  assert.equal(saved.status, 409);
  assert.equal(api.rows.length, 0);
  assert.equal(saved.data.feedbackTone, "blocked");
});

test("saving a recommendation returns authoritative totals and survives a fresh GET", async () => {
  const api = fixture([preference()]);
  const saved = await api.post({ name: "Juniper Table", kind: "suggest" });
  assert.equal(saved.status, 200);
  assert.deepEqual(saved.data.suggestedRestaurants, ["Juniper Table"]);
  assert.deepEqual(saved.data.publicPreferences, [{ kind: "suggest", name: "Juniper Table", normalizedName: "juniper table", count: 2 }]);
  const reloaded = await api.get();
  assert.deepEqual(reloaded.data.publicPreferences, saved.data.publicPreferences);
  assert.deepEqual(reloaded.data.suggestedRestaurants, saved.data.suggestedRestaurants);
  assert.equal(api.signals.length, 1);
  assert.equal(api.signals[0].suggestionWeight, 1);
});

test("repeating the same recommendation does not add a second heart or signal", async () => {
  const api = fixture();
  await api.post({ name: "Juniper Table", kind: "suggest" });
  const duplicate = await api.post({ name: "  Juniper   Table  ", kind: "suggest" });
  assert.equal(duplicate.data.publicPreferences[0].count, 1);
  assert.equal(api.rows.length, 1);
  assert.equal(api.signals.length, 1);
});

test("changing a recommendation to avoid replaces only the same context vote", async () => {
  const elsewhere = preference({ userId: "current-user", locationScope: "rome italy" });
  const api = fixture([elsewhere]);
  await api.post({ name: "Juniper Table", kind: "suggest" });
  const avoided = await api.post({ name: "Juniper Table", kind: "avoid" });
  assert.deepEqual(avoided.data.suggestedRestaurants, []);
  assert.deepEqual(avoided.data.avoidedRestaurants, ["Juniper Table"]);
  assert.deepEqual(avoided.data.publicPreferences.map(({ kind, count }) => ({ kind, count })), [{ kind: "avoid", count: 1 }]);
  assert.ok(api.rows.some(row => row.id === elsewhere.id && row.kind === "suggest"));
  assert.deepEqual(api.signals.map(({ suggestionWeight, avoidWeight }) => [suggestionWeight, avoidWeight]), [[1, 0], [-1, 0], [0, 1]]);
});

test("restaurant names written entirely in Unicode are saved and can be removed", async () => {
  const api = fixture();
  const saved = await api.post({ name: "米粉食堂", kind: "suggest" });
  assert.equal(saved.status, 200);
  assert.deepEqual(saved.data.suggestedRestaurants, ["米粉食堂"]);
  assert.equal(saved.data.publicPreferences[0].count, 1);
  const removed = await api.remove({ name: "米粉食堂", kind: "suggest" });
  assert.equal(removed.status, 200);
  assert.deepEqual(removed.data.publicPreferences, []);
  assert.equal(api.rows.length, 0);
});

test("the newest vote remains visible after more than 500 stored preferences", async () => {
  const api = fixture(Array.from({ length: 550 }, (_, index) => preference({
    name: `Popular Place ${index}`, normalizedName: `popular place ${index}`, userId: `user-${index}`,
  })));
  const saved = await api.post({ name: "ZZZ New Recommendation", kind: "suggest" });
  assert.equal(api.rows.length, 551);
  assert.equal(saved.data.publicPreferences.length, 551);
  assert.ok(saved.data.publicPreferences.some(item => item.name === "ZZZ New Recommendation" && item.count === 1));
  assert.deepEqual(saved.data.suggestedRestaurants, ["ZZZ New Recommendation"]);
  const reloaded = await api.get();
  assert.ok(reloaded.data.publicPreferences.some(item => item.name === "ZZZ New Recommendation" && item.count === 1));
});

test("removing a vote preserves other locations, allergies, food contexts, and users", async () => {
  const active = preference({ userId: "current-user" });
  const general = preference({ userId: "current-user", foodScope: "" });
  const retained = [
    preference({ userId: "current-user", locationScope: "rome italy" }),
    preference({ userId: "current-user", allergyScope: "milk" }),
    preference({ userId: "current-user", foodScope: "pizza" }),
    preference({ userId: "another-user" }),
  ];
  const api = fixture([active, general, ...retained]);
  const removed = await api.remove({ name: "Juniper Table", kind: "suggest" });
  assert.equal(removed.status, 200);
  assert.deepEqual(api.rows.map(row => row.id).sort(), retained.map(row => row.id).sort());
  assert.deepEqual(removed.data.suggestedRestaurants, []);
  assert.equal(removed.data.publicPreferences[0].count, 1);
  assert.deepEqual(api.signals.map(({ locationScope, foodScope, allergyScope, suggestionWeight }) => ({ locationScope, foodScope, allergyScope, suggestionWeight })), [
    { locationScope: "paris france", foodScope: "burgers", allergyScope: "gluten", suggestionWeight: -1 },
    { locationScope: "paris france", foodScope: "", allergyScope: "gluten", suggestionWeight: -1 },
  ]);
  await api.remove({ name: "Juniper Table", kind: "suggest" });
  assert.equal(api.signals.length, 2, "repeated deletion must not subtract a second time");
});

test("context reads exclude unrelated food votes while preserving general recommendations", async () => {
  const api = fixture([
    preference(),
    preference({ id: "general", name: "General Table", normalizedName: "general table", foodScope: "" }),
    preference({ id: "different-city", locationScope: "rome italy" }),
  ]);
  const generalSearch = await api.get({ ...context, food: "" });
  assert.deepEqual(generalSearch.data.publicSuggestedRestaurants, ["General Table"]);
  const burgerSearch = await api.get();
  assert.deepEqual(burgerSearch.data.publicSuggestedRestaurants, ["General Table", "Juniper Table"]);
});

test("removal without a location or allergy context cannot erase saved votes", async () => {
  const original = preference({ userId: "current-user" });
  const api = fixture([original]);
  const rejected = await api.remove({ name: "Juniper Table", kind: "suggest" }, {});
  assert.equal(rejected.status, 400);
  assert.deepEqual(api.rows, [original]);
  assert.deepEqual(api.signals, []);
});

test("hearts require an account but not Premium, while avoids remain Premium", async () => {
  const api = fixture();
  api.setUser(null);
  assert.equal((await api.post({ name: "Juniper Table" })).status, 401);
  api.setUser("current-user");
  api.setPremium(false);
  assert.equal((await api.post({ name: "Juniper Table", kind: "avoid" })).status, 402);
  assert.equal((await api.post({ name: "Juniper Table" })).status, 200);
  assert.deepEqual((await api.get()).data.suggestedRestaurants, ["Juniper Table"]);
  assert.equal((await api.remove({ name: "Juniper Table" })).status, 200);
  assert.deepEqual(api.rows, []);
});
