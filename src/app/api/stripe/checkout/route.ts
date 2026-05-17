import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  ensureCustomer,
  getProPriceId,
  getShieldPriceId,
  getStripe,
} from "@/lib/stripe";

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

  const formData = await request.formData().catch(() => null);
  const planParam = formData?.get("plan");
  const targetPlan: "pro" | "shield" =
    planParam === "shield" ? "shield" : "pro";

  let priceId: string;
  try {
    priceId =
      targetPlan === "shield" ? getShieldPriceId() : getProPriceId();
  } catch (e) {
    console.error(e);
    return NextResponse.redirect(
      new URL("/settings?stripe=missing_config", request.url),
      { status: 303 }
    );
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("stripe_customer_id")
    .eq("id", user.id)
    .maybeSingle();

  const customerId = await ensureCustomer({
    userId: user.id,
    email: user.email ?? null,
    existingCustomerId: profile?.stripe_customer_id ?? null,
    updateProfile: async (id) => {
      await supabase
        .from("profiles")
        .update({ stripe_customer_id: id })
        .eq("id", user.id);
    },
  });

  const origin =
    process.env.NEXT_PUBLIC_APP_URL ||
    request.nextUrl.origin;

  try {
    const session = await getStripe().checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      allow_promotion_codes: true,
      client_reference_id: user.id,
      subscription_data: {
        metadata: { user_id: user.id, target_plan: targetPlan },
      },
      success_url: `${origin}/api/stripe/confirm?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/settings?stripe=cancel`,
    });

    if (!session.url) {
      throw new Error("Stripe didn't return a session URL");
    }

    return NextResponse.redirect(session.url, { status: 303 });
  } catch (e) {
    console.error("Stripe checkout failed", e);
    return NextResponse.redirect(
      new URL("/settings?stripe=error", request.url),
      { status: 303 }
    );
  }
}
