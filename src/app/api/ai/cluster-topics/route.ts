import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { clusterChannelTopics } from "@/lib/topics";
import { hasProFeatures, normalizePlan } from "@/lib/plans";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Manual trigger du clustering des questions en topics pour les chaînes du
 * user. Réservé aux plans Pro & Shield (Free a un cluster hebdo limité top 3
 * via le cron, pas de re-cluster à la demande).
 */
export async function POST(request: NextRequest) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("plan")
    .eq("id", user.id)
    .maybeSingle();

  if (!hasProFeatures(normalizePlan(profile?.plan))) {
    return NextResponse.json({ error: "pro_only" }, { status: 403 });
  }

  const formData = await request.formData().catch(() => null);
  const channelIdParam = formData?.get("channelId");
  const redirectTo = formData?.get("redirectTo");

  const baseQuery = supabase
    .from("channels")
    .select("id")
    .eq("user_id", user.id)
    .eq("platform", "youtube");

  const { data: channels } =
    typeof channelIdParam === "string"
      ? await baseQuery.eq("id", channelIdParam)
      : await baseQuery;

  if (!channels || channels.length === 0) {
    return NextResponse.json({ error: "no_channel" }, { status: 404 });
  }

  const results = [];
  for (const channel of channels) {
    try {
      results.push(await clusterChannelTopics(channel.id));
    } catch (e) {
      console.error("cluster-topics failed", channel.id, e);
      results.push({
        channelId: channel.id,
        questionsConsidered: 0,
        topicsCreated: 0,
        topicsUpdated: 0,
        topicsArchived: 0,
        error: e instanceof Error ? e.message : "unknown",
      });
    }
  }

  if (typeof redirectTo === "string" && redirectTo.startsWith("/")) {
    const created = results.reduce(
      (sum, r) => sum + ("topicsCreated" in r ? r.topicsCreated : 0),
      0
    );
    const updated = results.reduce(
      (sum, r) => sum + ("topicsUpdated" in r ? r.topicsUpdated : 0),
      0
    );
    const url = new URL(redirectTo, request.url);
    url.searchParams.set("cluster", "done");
    url.searchParams.set("created", String(created));
    url.searchParams.set("updated", String(updated));
    return NextResponse.redirect(url, { status: 303 });
  }

  return NextResponse.json({ results });
}
