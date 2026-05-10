export type CategoryBreakdown = {
  question: number;
  positive: number;
  constructive: number;
  neutral: number;
  toxic: number;
  total: number;
};

/**
 * Score communauté /100. Formule :
 *  - Positifs comptent à 1.0
 *  - Questions à 0.7 (engagement, mais demande du travail)
 *  - Constructifs à 0.6 (utile mais critique)
 *  - Neutres à 0.4
 *  - Pénalité toxicité : -1.0 par commentaire toxique
 *
 * Le score est borné à [0, 100]. Si total = 0, on renvoie null
 * pour signaler "pas encore d'évaluation".
 */
export function computeCommunityScore(b: CategoryBreakdown): number | null {
  if (b.total === 0) return null;

  const weighted =
    b.positive * 1.0 +
    b.question * 0.7 +
    b.constructive * 0.6 +
    b.neutral * 0.4 -
    b.toxic * 1.0;

  const ratio = weighted / b.total;
  return Math.max(0, Math.min(100, Math.round(ratio * 100)));
}

export type Mood = "positive" | "neutral" | "tense";

export function moodFromScore(score: number | null): Mood {
  if (score == null) return "neutral";
  if (score >= 70) return "positive";
  if (score >= 40) return "neutral";
  return "tense";
}

export function moodLabelFr(mood: Mood): string {
  if (mood === "positive") return "Ambiance positive";
  if (mood === "tense") return "Ambiance tendue";
  return "Ambiance neutre";
}

export function positiveRatio(b: CategoryBreakdown): number {
  if (b.total === 0) return 0;
  return b.positive / b.total;
}
