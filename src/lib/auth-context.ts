import { cache } from "react";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { normalizePlan, type Plan } from "@/lib/plans";

/**
 * Récupère l'utilisateur courant. Utiliser React `cache()` permet de
 * dédupliquer les appels Supabase quand layout + page demandent tous les
 * deux le user dans la même requête.
 */
export const getCurrentUser = cache(async () => {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

export const requireUser = cache(async () => {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
});

export type AppContext = {
  user: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;
  plan: Plan;
  filterMode: "sensitive" | "standard" | "tough";
  language: "fr" | "en";
  metricShield: boolean;
  stripeCustomerId: string | null;
  channels: Array<{
    id: string;
    name: string;
    thumbnail_url: string | null;
    subscriber_count: number | null;
    last_synced_at: string | null;
    platform: string;
    created_at: string;
  }>;
};

/**
 * Charge en parallèle l'utilisateur, son profil et ses chaînes.
 * Caché par requête : layout + pages partagent le même résultat.
 */
export const getAppContext = cache(async (): Promise<AppContext> => {
  const supabase = createSupabaseServerClient();
  const user = await requireUser();

  const [profileRes, channelsRes] = await Promise.all([
    supabase
      .from("profiles")
      .select(
        "plan, filter_mode, language, metric_shield, stripe_customer_id"
      )
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("channels")
      .select(
        "id, name, thumbnail_url, subscriber_count, last_synced_at, platform, created_at"
      )
      .eq("user_id", user.id)
      .order("created_at", { ascending: true }),
  ]);

  const profile = profileRes.data;

  return {
    user,
    plan: normalizePlan(profile?.plan),
    filterMode:
      (profile?.filter_mode as
        | "sensitive"
        | "standard"
        | "tough"
        | undefined) ?? "standard",
    language: (profile?.language as "fr" | "en" | undefined) ?? "fr",
    metricShield: profile?.metric_shield === true,
    stripeCustomerId: profile?.stripe_customer_id ?? null,
    channels: (channelsRes.data ?? []) as AppContext["channels"],
  };
});
