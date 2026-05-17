import Stripe from "stripe";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Plan } from "@/lib/plans";

let _stripe: Stripe | null = null;

const ACTIVE_STATUSES = new Set<Stripe.Subscription.Status>([
  "active",
  "trialing",
]);

export function getStripe(): Stripe {
  if (_stripe) return _stripe;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error("STRIPE_SECRET_KEY is missing");
  }
  _stripe = new Stripe(key);
  return _stripe;
}

/**
 * ID du price Stripe pour le plan Pro mensuel (14 €/mois).
 * À créer dans le dashboard Stripe (ou via l'API), puis renseigner
 * STRIPE_PRICE_ID_PRO dans .env.local.
 */
export function getProPriceId(): string {
  const id = process.env.STRIPE_PRICE_ID_PRO;
  if (!id) {
    throw new Error(
      "STRIPE_PRICE_ID_PRO is missing — créer le price dans Stripe et l'ajouter à .env.local"
    );
  }
  return id;
}

/**
 * ID du price Stripe pour le plan Shield mensuel (29 €/mois).
 * Inclut tout Pro + Threat Detection (page /security, alertes email, raid detection).
 */
export function getShieldPriceId(): string {
  const id = process.env.STRIPE_PRICE_ID_SHIELD;
  if (!id) {
    throw new Error(
      "STRIPE_PRICE_ID_SHIELD is missing — créer le price dans Stripe et l'ajouter à .env.local"
    );
  }
  return id;
}

/** Mappe un price ID Stripe vers le Plan SafeSpace correspondant. */
export function planFromPriceId(priceId: string | null | undefined): Plan {
  if (!priceId) return "free";
  const shield = process.env.STRIPE_PRICE_ID_SHIELD;
  const pro = process.env.STRIPE_PRICE_ID_PRO;
  if (shield && priceId === shield) return "shield";
  if (pro && priceId === pro) return "pro";
  // Subscription Stripe sans match (test ancien price ID) → on tombe sur pro
  // par sécurité (l'utilisateur a payé quelque chose).
  return "pro";
}

/**
 * Crée (ou réutilise) un customer Stripe pour un user SafeSpace.
 * Le lien profile.stripe_customer_id est mis à jour si manquant.
 */
export async function ensureCustomer(args: {
  userId: string;
  email: string | null;
  existingCustomerId: string | null;
  updateProfile: (customerId: string) => Promise<void>;
}): Promise<string> {
  const stripe = getStripe();

  if (args.existingCustomerId) {
    // Vérifie qu'il n'a pas été supprimé côté Stripe.
    try {
      const c = await stripe.customers.retrieve(args.existingCustomerId);
      if (!("deleted" in c) || !c.deleted) {
        return args.existingCustomerId;
      }
    } catch {
      // recreate below
    }
  }

  const created = await stripe.customers.create({
    email: args.email ?? undefined,
    metadata: { user_id: args.userId },
  });
  await args.updateProfile(created.id);
  return created.id;
}

/**
 * Met à jour profiles.plan / stripe_customer_id / stripe_subscription_id à
 * partir d'une Subscription Stripe. Utilisé par le webhook ET par les
 * fallbacks de fulfillment (success_url, bouton "Resynchroniser").
 */
export async function syncSubscriptionToProfile(
  subscription: Stripe.Subscription,
  fallbackUserId?: string | null
): Promise<{ ok: boolean; userId: string | null; plan: Plan }> {
  const admin = createSupabaseAdminClient();
  const customerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer.id;

  const metadataUserId =
    (subscription.metadata?.user_id as string | undefined) ?? null;

  let userId = metadataUserId ?? fallbackUserId ?? null;
  if (!userId) {
    const { data } = await admin
      .from("profiles")
      .select("id")
      .eq("stripe_customer_id", customerId)
      .maybeSingle();
    userId = data?.id ?? null;
  }

  if (!userId) {
    return { ok: false, userId: null, plan: "free" };
  }

  const isActive = ACTIVE_STATUSES.has(subscription.status);
  // On lit le price ID du premier item de la subscription pour savoir
  // si c'est un abonnement Pro ou Shield. Si la subscription est
  // inactive (canceled/incomplete), on retombe sur 'free'.
  const firstItemPrice =
    subscription.items?.data?.[0]?.price?.id ?? null;
  const plan: Plan = isActive ? planFromPriceId(firstItemPrice) : "free";

  await admin
    .from("profiles")
    .update({
      plan,
      stripe_customer_id: customerId,
      stripe_subscription_id: subscription.id,
    })
    .eq("id", userId);

  return { ok: true, userId, plan };
}

/**
 * Récupère la subscription Stripe la plus récente d'un customer et synchronise
 * le profil. Utile en fallback quand le webhook n'a pas tourné (dev local).
 */
export async function syncProfileFromCustomer(
  customerId: string,
  userId: string
): Promise<{ ok: boolean; plan: Plan }> {
  const stripe = getStripe();
  const subs = await stripe.subscriptions.list({
    customer: customerId,
    status: "all",
    limit: 5,
  });

  // On choisit la plus pertinente : active/trialing en priorité, sinon la plus récente.
  const sorted = subs.data.slice().sort((a, b) => {
    const aw = ACTIVE_STATUSES.has(a.status) ? 1 : 0;
    const bw = ACTIVE_STATUSES.has(b.status) ? 1 : 0;
    if (aw !== bw) return bw - aw;
    return b.created - a.created;
  });

  const subscription = sorted[0];
  if (!subscription) {
    const admin = createSupabaseAdminClient();
    await admin
      .from("profiles")
      .update({ plan: "free", stripe_subscription_id: null })
      .eq("id", userId);
    return { ok: true, plan: "free" };
  }

  const result = await syncSubscriptionToProfile(subscription, userId);
  return { ok: result.ok, plan: result.plan };
}
