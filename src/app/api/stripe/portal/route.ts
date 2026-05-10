import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getStripe } from "@/lib/stripe";

export const dynamic = "force-dynamic";

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

  const origin =
    process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;

  try {
    const session = await getStripe().billingPortal.sessions.create({
      customer: profile.stripe_customer_id,
      return_url: `${origin}/settings`,
    });

    return NextResponse.redirect(session.url, { status: 303 });
  } catch (e) {
    console.error("Stripe portal failed", e);
    return NextResponse.redirect(
      new URL("/settings?stripe=error", request.url),
      { status: 303 }
    );
  }
}
