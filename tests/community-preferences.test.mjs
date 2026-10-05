import assert from "node:assert/strict";
import test from "node:test";
import { loadTsModule } from "./load-ts-module.mjs";

const {
  applyCommunityPreferences,
  createCommunityRestaurant,
  preferenceContextKey,
  preferenceMatchesContext,
  preferenceMatchesRestaurant,
} = loadTsModule("app/lib/community-preferences.ts");

const context = { location: "Paris, France", food: "burgers", allergies: ["Gluten"], mode: "premium" };
const createSuggestion = (name, index) => createCommunityRestaurant(name, index, context);
const names = restaurants => restaurants.map(restaurant => restaurant.name);
const discovered = () => ["Juniper Table", "Cedar Kitchen", "Maple House"].map((name, index) => ({
  id: `ai-${index}`, name, discoveryRank: index, popularityTier: 3, missingAllergies: [], suggestionCount: 0, avoidCount: 0,
}));
const suggest = (name, count = 1) => ({ kind: "suggest", name, count });
const avoid = (name, count = 1) => ({ kind: "avoid", name, count });

test("authoritative vote totals replace old counts without mutating discovery results", () => {
  const baseline = discovered();
  baseline[0].suggestionCount = 20;
  baseline[0].avoidCount = 10;
  baseline.forEach(Object.freeze);
  Object.freeze(baseline);

  const ranked = applyCommunityPreferences(baseline, [
    suggest("Juniper Table", 2), avoid("Juniper Table", 3), suggest("Cedar Kitchen"),
  ]);
  const juniper = ranked.find(restaurant => restaurant.name === "Juniper Table");
  assert.equal(juniper.suggestionCount, 2);
  assert.equal(juniper.avoidCount, 3);
  assert.equal(ranked.find(restaurant => restaurant.name === "Maple House").suggestionCount, 0);
  assert.equal(baseline[0].suggestionCount, 20);
  assert.equal(baseline[0].avoidCount, 10);
});

test("one recommendation visibly raises an equally suitable restaurant and is idempotent", () => {
  const votes = [suggest("Cedar Kitchen")];
  const ranked = applyCommunityPreferences(discovered(), votes);
  assert.deepEqual(names(ranked), ["Cedar Kitchen", "Juniper Table", "Maple House"]);
  assert.equal(ranked[0].suggestionCount, 1);
  assert.deepEqual(applyCommunityPreferences(ranked, votes), ranked);
});

test("removing recommendations restores the popularity order independently of avoids", () => {
  const baseline = discovered();
  const recommended = applyCommunityPreferences(baseline, [suggest("Maple House", 2)]);
  assert.equal(recommended[0].name, "Maple House");
  const avoided = applyCommunityPreferences(recommended, [avoid("Juniper Table")]);
  assert.equal(avoided[0].name, "Cedar Kitchen");
  assert.deepEqual(names(applyCommunityPreferences(avoided, [])), names(baseline));
  assert.ok(applyCommunityPreferences(avoided, []).every(restaurant => restaurant.suggestionCount === 0 && restaurant.avoidCount === 0));
});

test("hearts break equal-popularity ties without substituting allergy-confidence order", () => {
  const baseline = discovered();
  baseline[1].missingAllergies = ["Gluten"];
  const ranked = applyCommunityPreferences(baseline, [suggest("Cedar Kitchen", 20)]);
  assert.deepEqual(names(ranked), ["Cedar Kitchen", "Juniper Table", "Maple House"]);
  assert.equal(ranked[0].suggestionCount, 20);
});

test("matching votes from overlapping scopes aggregate before adding a new candidate", () => {
  const splitVotes = [suggest("Willow Grill"), suggest("Willow Grill"), avoid("Willow Grill")];
  const ranked = applyCommunityPreferences(discovered(), splitVotes, createSuggestion);
  const added = ranked.filter(restaurant => restaurant.name === "Willow Grill");
  assert.equal(added.length, 1);
  assert.equal(added[0].suggestionCount, 2);
  assert.equal(added[0].avoidCount, 1);
  assert.deepEqual(ranked, applyCommunityPreferences(discovered(), [suggest("Willow Grill", 2), avoid("Willow Grill")], createSuggestion));
});

test("recommended additions rise strongly and disappear when their votes are removed", () => {
  const baseline = discovered();
  const ranked = applyCommunityPreferences(baseline, [suggest("Willow Grill")], createSuggestion);
  assert.equal(names(ranked)[0], "Willow Grill");
  assert.deepEqual(names(applyCommunityPreferences(ranked, [], createSuggestion)), names(baseline));
  assert.deepEqual(names(applyCommunityPreferences(baseline, [suggest("Willow Grill"), avoid("Willow Grill")], createSuggestion)), names(baseline));
});

test("community candidates expose a real Maps search without inventing website or allergy evidence", () => {
  const candidate = createSuggestion("Willow Grill", 3);
  assert.equal(candidate.website, "");
  assert.equal(candidate.menuSourceUrl, "");
  assert.equal(candidate.websiteStatus, "missing");
  assert.equal(new URL(candidate.sourceUrl).searchParams.get("query"), "Willow Grill Paris, France");
  assert.deepEqual(candidate.supportedAllergies, []);
  assert.deepEqual(candidate.missingAllergies, ["Gluten"]);
  assert.deepEqual(candidate.allergenEvidence, []);
});

test("context matching requires overlapping location and allergies and honors food specificity", () => {
  const stored = { locationScope: "paris france", foodScope: "burgers", allergyScope: "gluten|milk" };
  assert.equal(preferenceMatchesContext(stored, { locationScope: "paris", foodScope: "burgers", allergyScope: "gluten" }), true);
  assert.equal(preferenceMatchesContext(stored, { locationScope: "rome italy", foodScope: "burgers", allergyScope: "gluten" }), false);
  assert.equal(preferenceMatchesContext(stored, { locationScope: "paris", foodScope: "burgers", allergyScope: "peanuts" }), false);
  assert.equal(preferenceMatchesContext(stored, { locationScope: "paris", foodScope: "", allergyScope: "gluten" }), false);
  assert.equal(preferenceMatchesContext(stored, { locationScope: "paris", foodScope: "pizza", allergyScope: "gluten" }), false);
  assert.equal(preferenceMatchesContext({ ...stored, foodScope: "" }, { locationScope: "paris", foodScope: "pizza", allergyScope: "gluten" }), true);
  assert.equal(preferenceMatchesContext(stored, { locationScope: "paris", foodScope: "burgers", allergyScope: "" }), false);
});

test("context keys tolerate formatting and allergy order but distinguish different searches", () => {
  const original = { ...context, allergies: ["Gluten", "Milk"] };
  const formatted = { ...context, location: " PARIS,   FRANCE ", food: " Burgers ", allergies: [" milk ", "GLUTEN"] };
  assert.equal(preferenceContextKey(original), preferenceContextKey(formatted));
  for (const change of [{ location: "Rome, Italy" }, { food: "pizza" }, { allergies: ["Gluten"] }, { mode: "free" }]) {
    assert.notEqual(preferenceContextKey(original), preferenceContextKey({ ...original, ...change }));
  }
});

test("multilingual restaurant names and accented aliases match without merging unrelated names", () => {
  assert.equal(preferenceMatchesRestaurant("Café Élan", "Cafe Elan"), true);
  assert.equal(preferenceMatchesRestaurant("寿司 青空", "寿司 青空"), true);
  assert.equal(preferenceMatchesRestaurant("寿司 青空", "寿司 桜"), false);
  assert.equal(preferenceMatchesRestaurant("Casa", "Casablanca"), false);
  const ranked = applyCommunityPreferences([
    { id: "ai-tokyo", name: "寿司 青空", missingAllergies: [] },
    { id: "ai-paris", name: "Café Élan", missingAllergies: [] },
  ], [suggest("寿司 青空"), suggest("Cafe Elan", 2)], createSuggestion);
  assert.equal(ranked.length, 2);
  assert.equal(ranked.find(restaurant => restaurant.id === "ai-tokyo").suggestionCount, 1);
  assert.equal(ranked.find(restaurant => restaurant.id === "ai-paris").suggestionCount, 2);
  assert.notEqual(createSuggestion("寿司 青空", 2).id, createSuggestion("寿司 桜", 3).id);
});
