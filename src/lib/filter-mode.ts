export type FilterMode = "sensitive" | "standard" | "tough";

export const FILTER_MODES: FilterMode[] = ["sensitive", "standard", "tough"];

export type FilterModeMeta = {
  value: FilterMode;
  label: string;
  description: string;
};

export const FILTER_MODE_META: Record<FilterMode, FilterModeMeta> = {
  sensitive: {
    value: "sensitive",
    label: "Sensible",
    description:
      "Masque dès le moindre signal négatif. Pour les jours fragiles.",
  },
  standard: {
    value: "standard",
    label: "Standard",
    description:
      "Masque uniquement les attaques personnelles, le harcèlement, le spam.",
  },
  tough: {
    value: "tough",
    label: "Peau Dure",
    description:
      "Ne masque que les commentaires les plus violents. Tu vois presque tout.",
  },
};

/**
 * Renvoie true si un commentaire doit être considéré comme "masqué" selon le
 * mode de filtrage choisi par l'utilisateur. Utilisé dans le Clean Feed et
 * l'agrégation de toxicité.
 */
export function isMaskedByFilter(
  c: { is_toxic: boolean | null; toxicity_score: number | null },
  mode: FilterMode
): boolean {
  const score = typeof c.toxicity_score === "number" ? c.toxicity_score : 0;
  const toxic = c.is_toxic === true;

  switch (mode) {
    case "sensitive":
      return toxic || score >= 0.3;
    case "tough":
      return toxic && score >= 0.7;
    case "standard":
    default:
      return toxic;
  }
}
