import assert from "node:assert/strict";
import test from "node:test";
import { loadTsModule } from "./load-ts-module.mjs";

const { rankWithCommunityPopularity } = loadTsModule("app/lib/community-ranking.ts");

function item(name, originalIndex, communityScore = 0, missingAllergyCount = 0, isCommunitySuggestion = false) {
  return { name, originalIndex, communityScore, missingAllergyCount, isCommunitySuggestion, popularityTier: isCommunitySuggestion ? 0 : 3 };
}

test("community reactions take priority over AI popularity", () => {
  const ranked = rankWithCommunityPopularity([
    { ...item("Full meal", 1), popularityTier: 5, matchQuality: 31 },
    { ...item("Dessert only", 0, 300), popularityTier: 4, matchQuality: 4 },
    { ...item("Unconfirmed", 2, 99999, 1, true), matchQuality: 34 },
  ]);
  assert.deepEqual(ranked.map(item => item.name), ["Unconfirmed", "Dessert only", "Full meal"]);
});

test("recommending the top restaurant increases its score without demoting it", () => {
  const ranked = rankWithCommunityPopularity([
    item("Friedman's", 0, 5),
    item("Bareburger", 1),
    item("5 Napkin Burger", 2),
  ]);

  assert.deepEqual(ranked.map(({ name }) => name), ["Friedman's", "Bareburger", "5 Napkin Burger"]);
});

test("community votes add to baseline popularity and can progressively raise a result", () => {
  const oneVote = rankWithCommunityPopularity([
    item("Friedman's", 0),
    item("Bareburger", 1, 5),
  ]);
  const threeVotes = rankWithCommunityPopularity([
    item("Friedman's", 0),
    item("Bareburger", 1, 15),
  ]);

  assert.deepEqual(oneVote.map(({ name }) => name), ["Bareburger", "Friedman's"]);
  assert.deepEqual(threeVotes.map(({ name }) => name), ["Bareburger", "Friedman's"]);
});

test("equal popularity sorts by hearts before stars, then keeps stable ties", () => {
  const ranked = rankWithCommunityPopularity([
    { ...item("Five stars", 0), heartCount: 1, starRating: 5 },
    { ...item("More hearts", 1), heartCount: 2, starRating: 2.5 },
    { ...item("Four stars", 2), heartCount: 1, starRating: 4 },
  ]);
  assert.deepEqual(ranked.map(item => item.name), ["More hearts", "Five stars", "Four stars"]);
});

test("community recommendations rise without changing their allergy evidence", () => {
  const ranked = rankWithCommunityPopularity([
    item("Friedman's", 0),
    item("Bareburger", 1),
    item("5 Napkin Burger", 2),
    item("Community Pick", 3, 5, 1, true),
  ]);

  assert.deepEqual(ranked.map(({ name }) => name), ["Community Pick", "Friedman's", "Bareburger", "5 Napkin Burger"]);
  assert.equal(ranked[0].missingAllergyCount, 1);
});

test("community reactions precede allergy evidence for AI additions", () => {
  const ranked = rankWithCommunityPopularity([
    { ...item("Cross-contact concerns", 0, 9999), evidenceRank: 1, popularityTier: 5, starRating: 5 },
    { ...item("Dedicated venue", 1), evidenceRank: 5, popularityTier: 0 },
    { ...item("Bun and dedicated fryer", 2), evidenceRank: 3, popularityTier: 0 },
  ]);
  assert.deepEqual(ranked.map(item => item.name), ["Cross-contact concerns", "Dedicated venue", "Bun and dedicated fryer"]);
});

test("equal reactions favor documented allergy evidence over popularity or guide inclusion", () => {
  const ranked = rankWithCommunityPopularity([
    { ...item("Popular guide pick", 0), guideRank: 1, heartCount: 2, starRating: 4, evidenceRank: 1, popularityTier: 5 },
    { ...item("Documented option", 1), heartCount: 2, starRating: 4, evidenceRank: 5, popularityTier: 1 },
  ]);
  assert.deepEqual(ranked.map(item => item.name), ["Documented option", "Popular guide pick"]);
});

test("a five-star rating raises a previously last unrated restaurant", () => {
  const ranked = rankWithCommunityPopularity([
    { ...item("Guide one", 0), guideRank: 1, heartCount: 0, starRating: 3 },
    { ...item("Guide two", 1), guideRank: 2, heartCount: 0, starRating: 3 },
    { ...item("Previously last", 2), heartCount: 0, starRating: 5 },
  ]);
  assert.equal(ranked[0].name, "Previously last");
});

test("dislikes lower a result and missing ratings are neutral at three stars", () => {
  const ranked = rankWithCommunityPopularity([
    { ...item("Unrated", 0), heartCount: 0 },
    { ...item("Disliked", 1), heartCount: 0, avoidCount: 1, starRating: 3 },
  ]);
  assert.deepEqual(ranked.map(item => item.name), ["Unrated", "Disliked"]);
});
