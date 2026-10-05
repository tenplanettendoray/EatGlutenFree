export type CommunityRankItem = {
  originalIndex: number;
  communityScore: number;
  missingAllergyCount: number;
  isCommunitySuggestion?: boolean;
  matchQuality?: number;
  popularityTier?: number;
  heartCount?: number;
  avoidCount?: number;
  starRating?: number;
  evidenceRank?: number;
  guideRank?: number;
};

/** Community reactions lead globally; factual allergy evidence remains independent of votes. */
export function rankWithCommunityPopularity<T extends CommunityRankItem>(items: T[]) {
  const reaction = (item: T) => {
    const rating = Math.max(0, Math.min(5, item.starRating ?? 3));
    const votes = item.heartCount !== undefined
      ? Math.max(0, item.heartCount) * 40 - Math.max(0, item.avoidCount || 0) * 45
      : item.communityScore;
    // Three stars is the neutral score for an unrated restaurant. A real rating
    // above or below it must be strong enough to visibly move a result.
    return votes + (rating - 3) * 15;
  };
  return [...items].sort((a, b) => {
    const communityDifference = reaction(b) - reaction(a);
    if (communityDifference) return communityDifference;
    const evidenceDifference = (b.evidenceRank || 0) - (a.evidenceRank || 0);
    if (evidenceDifference) return evidenceDifference;
    const guideA = Number(Boolean(a.guideRank)), guideB = Number(Boolean(b.guideRank));
    if (guideA !== guideB) return guideB - guideA;
    if (guideA) return a.guideRank! - b.guideRank! || a.originalIndex - b.originalIndex;
    return (b.popularityTier || 0) - (a.popularityTier || 0)
      || a.originalIndex - b.originalIndex;
  });
}
