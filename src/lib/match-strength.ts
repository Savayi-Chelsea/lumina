/**
 * Plain-language strength label for a mentor match, in place of the raw cosine
 * similarity (results cluster between 0.50 and 0.70, so differences in the third
 * decimal look meaningful to members but are not).
 *
 * Bands come from the matching evaluation (evaluation/results/matching/
 * per_query_rankings.csv: 110 semantic results over 22 labelled queries):
 * every result at 0.60 or above was relevant, 73% between 0.55 and 0.60, and
 * 52% between the 0.50 search threshold and 0.55. The exact score is still
 * logged for evaluation; it is never shown to members.
 */
export type MatchStrength = { label: "Strong match" | "Good match" | "Possible match"; level: 1 | 2 | 3 };

export const STRONG_MATCH = 0.6;
export const GOOD_MATCH = 0.55;

export function matchStrength(score: number): MatchStrength {
  if (score >= STRONG_MATCH) return { label: "Strong match", level: 3 };
  if (score >= GOOD_MATCH) return { label: "Good match", level: 2 };
  return { label: "Possible match", level: 1 };
}
