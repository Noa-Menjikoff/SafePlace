import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getStripe, syncSubscriptionToProfile } from "@/lib/stripe";

export const dynamic = "force-dynamic";

/**
 * Cible du `success_url` du checkout. Tire la session Stripe par son id,
 * récupère la subscription rattachée et synchronise le profil immédiatement
 * — sans dépendre du webhook (utile en local sans `stripe listen`).
 *
 * Le webhook reste actif en parallèle : si les deux passent, le résultat est
 * idempotent.
 */
export async function GET(request: NextRequest) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const sessionId = request.nextUrl.searchParams.get("session_id");
  if (!sessionId) {
    return NextResponse.redirect(
      new URL("/settings?stripe=success", request.url)
    );
  }

  try {
    const session = await getStripe().checkout.sessions.retrieve(sessionId, {
      expand: ["subscription"],
    });

    // Sécurité : la session doit appartenir au user courant.
    const sessionUserId =
      (session.client_reference_id as string | null) ??
      (session.metadata?.user_id as string | undefined) ??
      null;

    if (sessionUserId && sessionUserId !== user.id) {
      return NextResponse.redirect(
        new URL("/settings?stripe=error", request.url)
      );
    }

    const subscription =
      session.subscription && typeof session.subscription !== "string"
        ? session.subscription
        : null;

    if (subscription) {
      await syncSubscriptionToProfile(subscription, user.id);
    }
  } catch (e) {
    console.error("/api/stripe/confirm failed", e);
    return NextResponse.redirect(
      new URL("/settings?stripe=error", request.url)
    );
  }

  return NextResponse.redirect(
    new URL("/settings?stripe=success", request.url)
  );
}
