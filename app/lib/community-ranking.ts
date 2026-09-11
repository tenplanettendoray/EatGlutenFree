export type CommunityRankItem = {
  originalIndex: number;
  communityScore: number;
  missingAllergyCount: number;
};

/**
 * Keep the discovery order as the baseline popularity signal, then add the
 * community score to it. A positive vote can only improve (or preserve) a
 * restaurant's position; it must never be pulled out and reinserted lower.
 */
export function rankWithCommunityPopularity<T extends CommunityRankItem>(items: T[]) {
  return [...items].sort((a, b) =>
    a.missingAllergyCount - b.missingAllergyCount
    || (b.communityScore - b.originalIndex * 10) - (a.communityScore - a.originalIndex * 10)
    || a.originalIndex - b.originalIndex);
}
