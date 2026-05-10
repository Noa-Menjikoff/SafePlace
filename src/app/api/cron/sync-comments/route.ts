import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { syncChannelComments } from "@/lib/youtube-sync";
import { classifyChannelPending } from "@/lib/classify";
import { isAuthorizedCron } from "@/lib/cron-auth";
import type { StoredChannel } from "@/lib/youtube";

export const dynamic = "force-dynamic";
// Hobby tier max = 60s. On laisse 5 min pour les comptes Pro avec plus de
// commentaires. Si on dépasse, on s'arrête proprement.
export const maxDuration = 300;

const TIME_BUDGET_MS = 280_000; // marge sur maxDuration
const MAX_CHANNELS_PER_RUN = 100;

type ChannelRow = StoredChannel & { last_synced_at: string | null };

export async function GET(request: NextRequest) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createSupabaseAdminClient();

  // Sélectionne les chaînes en commençant par celles dont le dernier sync
  // est le plus ancien (ou jamais sync — nulls first).
  const { data: channels, error } = await admin
    .from("channels")
    .select(
      "id, user_id, platform, platform_id, name, thumbnail_url, access_token, refresh_token, token_expires_at, subscriber_count, last_synced_at"
    )
    .eq("platform", "youtube")
    .order("last_synced_at", { ascending: true, nullsFirst: true })
    .limit(MAX_CHANNELS_PER_RUN);

  if (error) {
    console.error("cron sync-comments: list channels failed", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Plans utilisateurs (un seul appel pour tous).
  const userIds = Array.from(
    new Set((channels ?? []).map((c) => c.user_id))
  );
  const planByUser = new Map<string, "free" | "pro">();
  if (userIds.length > 0) {
    const { data: profiles } = await admin
      .from("profiles")
      .select("id, plan")
      .in("id", userIds);
    for (const p of profiles ?? []) {
      planByUser.set(p.id, (p.plan as "free" | "pro") ?? "free");
    }
  }

  const startedAt = Date.now();
  const results: Array<{
    channelId: string;
    fetched: number;
    inserted: number;
    classified: number;
    ok: boolean;
    error?: string;
  }> = [];

  let processed = 0;
  let skipped = 0;

  for (const channel of (channels ?? []) as ChannelRow[]) {
    if (Date.now() - startedAt > TIME_BUDGET_MS) {
      skipped += 1;
      continue;
    }

    const plan = planByUser.get(channel.user_id) ?? "free";

    try {
      const synced = await syncChannelComments(channel, plan);
      let classified = 0;
      try {
        const c = await classifyChannelPending(channel.id);
        classified = c.classified;
      } catch (e) {
        console.error(
          "cron sync-comments: classify failed",
          channel.id,
          e
        );
      }
      results.push({
        channelId: channel.id,
        fetched: synced.fetched,
        inserted: synced.inserted,
        classified,
        ok: true,
      });
    } catch (e) {
      console.error(
        "cron sync-comments: sync failed",
        channel.id,
        e
      );
      results.push({
        channelId: channel.id,
        fetched: 0,
        inserted: 0,
        classified: 0,
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
    totalInserted: results.reduce((s, r) => s + r.inserted, 0),
    totalClassified: results.reduce((s, r) => s + r.classified, 0),
  };

  console.log("cron sync-comments done", summary);

  return NextResponse.json({ summary, results });
}
