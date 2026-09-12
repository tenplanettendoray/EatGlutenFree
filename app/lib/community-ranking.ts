export type CommunityRankItem = {
  originalIndex: number;
  communityScore: number;
  missingAllergyCount: number;
  isCommunitySuggestion?: boolean;
};

/**
 * Keep the discovery order as the baseline popularity signal, then add the
 * community score to it. A positive vote can only improve (or preserve) a
 * restaurant's position; it must never be pulled out and reinserted lower.
 */
export function rankWithCommunityPopularity<T extends CommunityRankItem>(items: T[]) {
  const score = (item: T) => item.isCommunitySuggestion
    // A new community recommendation has no discovery position of its own.
    // Give its first vote a visible third-place baseline, then let additional
    // votes move it upward instead of treating its appended array index as rank.
    ? item.communityScore - 20
    : item.communityScore - item.originalIndex * 10 - item.missingAllergyCount * 1000;

  return [...items].sort((a, b) =>
    score(b) - score(a)
    || a.originalIndex - b.originalIndex);
}
