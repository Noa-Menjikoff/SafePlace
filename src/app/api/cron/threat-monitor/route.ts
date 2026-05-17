import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  scanChannelThreats,
  updateStalkerProfiles,
  detectRaid,
} from "@/lib/threat-detection";
import { isAuthorizedCron } from "@/lib/cron-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const TIME_BUDGET_MS = 280_000;
const MAX_CHANNELS_PER_RUN = 100;

/**
 * Cron de surveillance — exécute le pipeline threat-scan sur toutes les
 * chaînes actives. Vercel Hobby = 1×/jour, Pro = horaire (2h pour le raid
 * detection reste pertinent même sur Hobby car la fenêtre est glissante).
 */
export async function GET(request: NextRequest) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createSupabaseAdminClient();

  const { data: channels, error } = await admin
    .from("channels")
    .select("id, user_id")
    .eq("platform", "youtube")
    .order("last_synced_at", { ascending: true, nullsFirst: true })
    .limit(MAX_CHANNELS_PER_RUN);

  if (error) {
    console.error("cron threat-monitor: list channels failed", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const startedAt = Date.now();
  const results: Array<{
    channelId: string;
    analyzed: number;
    flagged: number;
    stalkers: number;
    raid: boolean;
    ok: boolean;
    error?: string;
  }> = [];

  let processed = 0;
  let skipped = 0;

  for (const channel of channels ?? []) {
    if (Date.now() - startedAt > TIME_BUDGET_MS) {
      skipped += 1;
      continue;
    }

    try {
      const scan = await scanChannelThreats(channel.id);
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

      results.push({
        channelId: channel.id,
        analyzed: scan.analyzed,
        flagged: scan.flagged,
        stalkers: stalkers.upserted,
        raid: raid.raidDetected,
        ok: true,
      });
    } catch (e) {
      console.error("cron threat-monitor: pipeline failed", channel.id, e);
      results.push({
        channelId: channel.id,
        analyzed: 0,
        flagged: 0,
        stalkers: 0,
        raid: false,
        ok: false,
        error: e instanceof Error ? e.message : "unknown",
      });
    }

    processed += 1;
  }

  const summary = {
    ranAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
    processed,
    skipped,
    succeeded: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    totalFlagged: results.reduce((s, r) => s + r.flagged, 0),
    totalRaids: results.filter((r) => r.raid).length,
  };

  console.log("cron threat-monitor done", summary);

  return NextResponse.json({ summary, results });
}
