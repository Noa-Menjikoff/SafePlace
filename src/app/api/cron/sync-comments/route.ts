import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { syncChannelComments } from "@/lib/youtube-sync";
import { classifyChannelPending } from "@/lib/classify";
import {
  scanChannelThreats,
  updateStalkerProfiles,
  detectRaid,
  sendDigests,
} from "@/lib/threat-detection";
import {
  clusterChannelTopics,
  detectAnsweredTopics,
  sendNewTopicsDigest,
} from "@/lib/topics";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { hasProFeatures, normalizePlan, type Plan } from "@/lib/plans";
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
  const planByUser = new Map<string, Plan>();
  if (userIds.length > 0) {
    const { data: profiles } = await admin
      .from("profiles")
      .select("id, plan")
      .in("id", userIds);
    for (const p of profiles ?? []) {
      planByUser.set(p.id, normalizePlan(p.plan));
    }
  }

  const startedAt = Date.now();
  const results: Array<{
    channelId: string;
    fetched: number;
    inserted: number;
    classified: number;
    threatsAnalyzed: number;
    threatsFlagged: number;
    stalkers: number;
    raid: boolean;
    topicsCreated: number;
    topicsUpdated: number;
    topicsAnswered: number;
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

      // Pipeline threat detection — chaîné ici pour rester sous la limite
      // de 2 crons du plan Hobby. Chaque étape est isolée : une erreur
      // sur la détection ne bloque pas le sync principal.
      let threatsAnalyzed = 0;
      let threatsFlagged = 0;
      let stalkers = 0;
      let raid = false;
      try {
        const t = await scanChannelThreats(channel.id);
        threatsAnalyzed = t.analyzed;
        threatsFlagged = t.flagged;
      } catch (e) {
        console.error("cron sync-comments: threat scan failed", channel.id, e);
      }
      try {
        const s = await updateStalkerProfiles(channel.id);
        stalkers = s.upserted;
      } catch (e) {
        console.error(
          "cron sync-comments: stalker update failed",
          channel.id,
          e
        );
      }
      try {
        const r = await detectRaid(channel.id);
        raid = r.raidDetected;
      } catch (e) {
        console.error("cron sync-comments: raid detection failed", channel.id, e);
      }

      // Clustering questions → topics (Feature 2). Pro & Shield seulement —
      // les users Free auront un cluster top 3 via le cron summaries hebdo.
      let topicsCreated = 0;
      let topicsUpdated = 0;
      let topicsAnswered = 0;
      if (hasProFeatures(plan)) {
        try {
          const c = await clusterChannelTopics(channel.id);
          topicsCreated = c.topicsCreated;
          topicsUpdated = c.topicsUpdated;
        } catch (e) {
          console.error(
            "cron sync-comments: topic clustering failed",
            channel.id,
            e
          );
        }
        // Détection auto-answered : matche les vidéos récemment publiées
        // contre les topics ouverts pour fermer ceux qui ont eu leur vidéo.
        try {
          const a = await detectAnsweredTopics(channel.id);
          topicsAnswered = a.topicsAnswered;
        } catch (e) {
          console.error(
            "cron sync-comments: detect answered topics failed",
            channel.id,
            e
          );
        }
      }

      results.push({
        channelId: channel.id,
        fetched: synced.fetched,
        inserted: synced.inserted,
        classified,
        threatsAnalyzed,
        threatsFlagged,
        stalkers,
        raid,
        topicsCreated,
        topicsUpdated,
        topicsAnswered,
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
        threatsAnalyzed: 0,
        threatsFlagged: 0,
        stalkers: 0,
        raid: false,
        topicsCreated: 0,
        topicsUpdated: 0,
        topicsAnswered: 0,
        ok: false,
        error: e instanceof Error ? e.message : "unknown",
      });
    }

    processed += 1;
  }

  // Une fois tous les scans terminés, envoie le digest quotidien aux users
  // qui ont opt-in. Isolé : un échec d'envoi ne plante pas le cron.
  let digest: Awaited<ReturnType<typeof sendDigests>> | null = null;
  try {
    digest = await sendDigests("digest_daily");
  } catch (e) {
    console.error("cron sync-comments: daily digest failed", e);
  }

  // Notifications "nouveaux topics émergent" — un email par user dont au
  // moins un topic vient de dépasser le seuil de 5 questions et n'a jamais
  // été notifié. Pro & Shield seulement (gating dans la fonction).
  let topicsDigest: Awaited<ReturnType<typeof sendNewTopicsDigest>> | null =
    null;
  try {
    topicsDigest = await sendNewTopicsDigest();
  } catch (e) {
    console.error("cron sync-comments: new topics digest failed", e);
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
    totalThreatsFlagged: results.reduce((s, r) => s + r.threatsFlagged, 0),
    totalRaids: results.filter((r) => r.raid).length,
    totalTopicsCreated: results.reduce((s, r) => s + r.topicsCreated, 0),
    totalTopicsUpdated: results.reduce((s, r) => s + r.topicsUpdated, 0),
    totalTopicsAnswered: results.reduce((s, r) => s + r.topicsAnswered, 0),
    digestUsersEmailed: digest?.usersEmailed ?? 0,
    digestAlertsSent: digest?.alertsSent ?? 0,
    topicsDigestUsersEmailed: topicsDigest?.usersEmailed ?? 0,
    topicsDigestNotified: topicsDigest?.topicsNotified ?? 0,
  };

  console.log("cron sync-comments done", summary);

  return NextResponse.json({ summary, results });
}
