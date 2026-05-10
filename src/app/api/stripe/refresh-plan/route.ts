import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { syncProfileFromCustomer } from "@/lib/stripe";

export const dynamic = "force-dynamic";

/**
 * Recovery : récupère l'état réel de la subscription Stripe pour ce user
 * et met à jour profiles.plan en conséquence. Utile si le webhook a manqué
 * un événement (dev local sans `stripe listen` actif).
 */
export async function POST(request: NextRequest) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(new URL("/login", request.url), {
      status: 303,
    });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("stripe_customer_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.stripe_customer_id) {
    return NextResponse.redirect(
      new URL("/settings?stripe=no_customer", request.url),
      { status: 303 }
    );
  }

  try {
    const result = await syncProfileFromCustomer(
      profile.stripe_customer_id,
      user.id
    );
    const param = result.plan === "pro" ? "synced_pro" : "synced_free";
    return NextResponse.redirect(
      new URL(`/settings?stripe=${param}`, request.url),
      { status: 303 }
    );
  } catch (e) {
    console.error("refresh-plan failed", e);
    return NextResponse.redirect(
      new URL("/settings?stripe=error", request.url),
      { status: 303 }
    );
  }
}
