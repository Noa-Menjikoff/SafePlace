import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";
import { getStripe, syncSubscriptionToProfile } from "@/lib/stripe";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
// Stripe webhooks need the raw body — disable Next caching/parsing.
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const stripe = getStripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "missing_webhook_secret" },
      { status: 500 }
    );
  }

  const sig = request.headers.get("stripe-signature");
  if (!sig) {
    return NextResponse.json({ error: "missing_signature" }, { status: 400 });
  }

  const rawBody = await request.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, secret);
  } catch (e) {
    console.error("Webhook signature verification failed", e);
    return NextResponse.json({ error: "invalid_signature" }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId =
          (session.client_reference_id as string | null) ??
          (session.metadata?.user_id as string | undefined) ??
          null;
        const customerId =
          typeof session.customer === "string" ? session.customer : null;
        if (userId && customerId) {
          await admin
            .from("profiles")
            .update({ stripe_customer_id: customerId })
            .eq("id", userId);
        }
        // La subscription elle-même arrivera via subscription.created.
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        await syncSubscriptionToProfile(subscription);
        break;
      }
      default:
        // Autres events ignorés.
        break;
    }
  } catch (e) {
    console.error("Webhook handler error", e);
    return NextResponse.json({ error: "handler_error" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
