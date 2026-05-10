import type { NextRequest } from "next/server";

/**
 * Vérifie qu'une requête vient bien du cron Vercel.
 *
 * Vercel envoie automatiquement le header
 *   `Authorization: Bearer ${CRON_SECRET}`
 * lorsque la variable CRON_SECRET est définie côté projet.
 *
 * En local on peut tester en passant le même header avec curl :
 *   curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/...
 */
export function isAuthorizedCron(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    // Pas de secret configuré : tolère seulement si on tourne en dev local.
    return process.env.NODE_ENV !== "production";
  }
  const auth = request.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}
