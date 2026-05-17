import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  scanChannelThreats,
  updateStalkerProfiles,
  detectRaid,
} from "@/lib/threat-detection";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Lance le pipeline de détection de menaces sur les chaînes de l'utilisateur :
 *   1. scan Gemini des commentaires non analysés → MAJ comments.threat_*
 *      + insert threat_alerts ≥ alerts_min_severity
 *   2. recalcul des stalker_profiles (agrégation par auteur)
 *   3. détection raid sur 2h glissantes
 *
 * Triggerable depuis l'UI (bouton "Lancer un scan") ou enchaîné après un sync.
 */
export async function POST(request: NextRequest) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const formData = await request.formData().catch(() => null);
  const channelIdParam = formData?.get("channelId");
  const force = formData?.get("force") === "1";
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
      const scan = await scanChannelThreats(channel.id, { force });
      const stalkers = await updateStalkerProfiles(channel.id).catch((e) => {
        console.error("updateStalkerProfiles failed", channel.id, e);
        return { channelId: channel.id, upserted: 0 };
      });
      const raid = await detectRaid(channel.id).catch((e) => {
        console.error("detectRaid failed", channel.id, e);
        return {
          channelId: channel.id,
          raidDetected: false,
          total: 0,
          toxic: 0,
        };
      });
      results.push({ ...scan, stalkers: stalkers.upserted, raid });
    } catch (e) {
      console.error("threat-scan failed", channel.id, e);
      results.push({
        channelId: channel.id,
        pending: 0,
        analyzed: 0,
        flagged: 0,
        failedBatches: 1,
        error: e instanceof Error ? e.message : "unknown",
      });
    }
  }

  if (typeof redirectTo === "string" && redirectTo.startsWith("/")) {
    const flagged = results.reduce(
      (sum, r) => sum + ("flagged" in r ? (r.flagged ?? 0) : 0),
      0
    );
    const url = new URL(redirectTo, request.url);
    url.searchParams.set("scan", "done");
    url.searchParams.set("flagged", String(flagged));
    return NextResponse.redirect(url, { status: 303 });
  }

  return NextResponse.json({ results });
}
