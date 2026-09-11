import assert from "node:assert/strict";
import test from "node:test";
import { loadTsModule } from "./load-ts-module.mjs";

const { rankWithCommunityPopularity } = loadTsModule("app/lib/community-ranking.ts");

function item(name, originalIndex, communityScore = 0, missingAllergyCount = 0) {
  return { name, originalIndex, communityScore, missingAllergyCount };
}

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

  assert.deepEqual(oneVote.map(({ name }) => name), ["Friedman's", "Bareburger"]);
  assert.deepEqual(threeVotes.map(({ name }) => name), ["Bareburger", "Friedman's"]);
});
