/**
 * Plans tarifaires SafeSpace.
 *
 * Hiérarchie : free < pro < shield.
 * - Pro débloque : Quick Reply, Stats 90j, Metric Shield, 3 chaînes, 2000 comments/sync
 * - Shield débloque tout Pro + Threat Detection (/security, alertes email, raid detection)
 */
export type Plan = "free" | "pro" | "shield";

export const PLANS: readonly Plan[] = ["free", "pro", "shield"] as const;

/** True si l'utilisateur a accès aux features Pro (Pro ET Shield). */
export function hasProFeatures(plan: Plan): boolean {
  return plan === "pro" || plan === "shield";
}

/** True si l'utilisateur a accès aux features Shield (Shield uniquement). */
export function hasShieldFeatures(plan: Plan): boolean {
  return plan === "shield";
}

/** Normalize une valeur arbitraire (DB, env) vers un Plan valide. */
export function normalizePlan(value: unknown): Plan {
  if (value === "pro") return "pro";
  if (value === "shield") return "shield";
  return "free";
}
