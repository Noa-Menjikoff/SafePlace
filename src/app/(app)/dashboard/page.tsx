import {
  Sparkles,
  Play,
  RefreshCw,
  ShieldCheck,
  Users,
  Filter,
  Gauge,
} from "lucide-react";
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAppContext } from "@/lib/auth-context";
import { CheckInBanner } from "@/components/checkin-banner";
import { TldrCard } from "@/components/tldr-card";
import { MetricCard } from "@/components/metric-card";
import { VideoRow, type VideoSummary } from "@/components/video-row";
import {
  computeCommunityScore,
  moodFromScore,
  type CategoryBreakdown,
} from "@/lib/score";
import { relativeTimeFr } from "@/lib/format";
import type { TldrInsight } from "@/lib/gemini";

export const dynamic = "force-dynamic";

type SearchParams = {
  summary?: "done" | "insufficient" | "error" | "no_channel";
  checkin?: string;
};

const VALID_MOODS = ["exhausted", "tired", "neutral", "good", "great"] as const;
type CheckInMood = (typeof VALID_MOODS)[number];

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const ctx = await getAppContext();
  const supabase = createSupabaseServerClient();
  const channelIds = ctx.channels.map((c) => c.id);
  const primaryChannel = ctx.channels[0] ?? null;
  const hasChannel = channelIds.length > 0;

  // Une seule requête sur les commentaires : on agrège en JS.
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);

  const [commentsRes, latestCheckinRes, latestSummaryRes, recentRes] =
    await Promise.all([
      hasChannel
        ? supabase
            .from("comments")
            .select("category, is_toxic")
            .in("channel_id", channelIds)
        : Promise.resolve({
            data: [] as { category: string | null; is_toxic: boolean | null }[],
          }),
      supabase
        .from("checkins")
        .select("mood")
        .eq("user_id", ctx.user.id)
        .gte("created_at", startOfDay.toISOString())
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      hasChannel
        ? supabase
            .from("summaries")
            .select(
              "insights, raw_count, community_score, positive_ratio, created_at"
            )
            .eq("channel_id", primaryChannel!.id)
            .order("week_start", { ascending: false })
            .limit(1)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      hasChannel
        ? supabase
            .from("comments")
            .select("video_id, video_title, category, is_toxic, published_at")
            .in("channel_id", channelIds)
            .not("video_id", "is", null)
            .order("published_at", { ascending: false })
            .limit(500)
        : Promise.resolve({
            data: [] as Array<{
              video_id: string | null;
              video_title: string | null;
              category: string | null;
              is_toxic: boolean | null;
              published_at: string | null;
            }>,
          }),
    ]);

  const breakdown = aggregateBreakdown(commentsRes.data ?? []);
  const score = computeCommunityScore(breakdown);
  const mood = moodFromScore(score);
  const todaysMood =
    latestCheckinRes.data?.mood &&
    VALID_MOODS.includes(latestCheckinRes.data.mood as CheckInMood)
      ? (latestCheckinRes.data.mood as CheckInMood)
      : null;
  const latestSummary = latestSummaryRes.data;
  const insights = (latestSummary?.insights as TldrInsight[] | null) ?? null;
  const videos = aggregateVideos(recentRes.data ?? []);

  if (!hasChannel) {
    return (
      <div className="mx-auto max-w-5xl flex flex-col gap-8">
        <div>
          <h1 className="text-h1">Bonjour {ctx.user.email?.split("@")[0]} 👋</h1>
          <p className="text-muted text-body mt-1">
            Ta communauté t&apos;a envoyé des messages. SafeSpace les filtre
            pour toi.
          </p>
        </div>
        <CheckInBanner todaysMood={todaysMood} />
        <section className="ss-card p-8 flex flex-col items-start gap-4">
          <div className="ss-pill-primary">
            <Sparkles className="h-3.5 w-3.5" aria-hidden />
            Première étape
          </div>
          <h2 className="text-h2">Connecte ta chaîne YouTube</h2>
          <p className="text-muted">
            On va aspirer tes commentaires des 7 derniers jours, les classer
            par catégorie et masquer la toxicité. Aucun commentaire n&apos;est
            jamais supprimé sur YouTube.
          </p>
          <a href="/api/youtube/connect" className="ss-button-primary">
            <Play className="h-4 w-4" aria-hidden />
            Connecter YouTube
          </a>
        </section>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl flex flex-col gap-8">
      <div>
        <h1 className="text-h1">Bonjour {ctx.user.email?.split("@")[0]} 👋</h1>
        <p className="text-muted text-body mt-1">
          Ta communauté t&apos;a envoyé des messages. SafeSpace les filtre pour
          toi.
        </p>
      </div>

      <CheckInBanner todaysMood={todaysMood} />

      <TldrCard
        insights={insights}
        rawCount={latestSummary?.raw_count ?? null}
        generatedAt={latestSummary?.created_at ?? null}
        mood={mood}
        onRefreshAction="/api/ai/summarize"
        channelId={primaryChannel?.id ?? null}
        notice={searchParams.summary ?? null}
      />

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Commentaires filtrés"
          value={breakdown.total}
          icon={<Filter className="h-3.5 w-3.5" aria-hidden />}
          variant="primary"
          alwaysVisible
          shielded={ctx.metricShield}
          hint={
            primaryChannel?.last_synced_at
              ? `sync ${relativeTimeFr(primaryChannel.last_synced_at)}`
              : "jamais synchronisé"
          }
        />
        <MetricCard
          label="Toxicité bloquée"
          value={breakdown.toxic}
          icon={<ShieldCheck className="h-3.5 w-3.5" aria-hidden />}
          variant="primary"
          alwaysVisible
          shielded={ctx.metricShield}
          hint={
            breakdown.total > 0
              ? `${Math.round((breakdown.toxic / breakdown.total) * 100)}% du flux`
              : undefined
          }
        />
        <MetricCard
          label="Score communauté"
          value={score}
          suffix="/100"
          icon={<Gauge className="h-3.5 w-3.5" aria-hidden />}
          variant={
            mood === "positive" ? "teal" : mood === "tense" ? "amber" : "primary"
          }
          alwaysVisible
          shielded={ctx.metricShield}
          hint="positifs - toxiques, pondéré"
        />
        <MetricCard
          label="Abonnés"
          value={primaryChannel?.subscriber_count ?? null}
          icon={<Users className="h-3.5 w-3.5" aria-hidden />}
          variant="primary"
          defaultVisible={false}
          shielded={ctx.metricShield}
          hint="masqué par défaut · Metric Shield"
        />
      </section>

      <section className="ss-card p-6">
        <header className="flex items-center justify-between gap-3">
          <h2 className="text-h2">Vidéos récentes</h2>
          <form action="/api/youtube/sync" method="post">
            <input type="hidden" name="redirect" value="1" />
            <button
              type="submit"
              className="ss-button-ghost h-9 px-3 text-caption"
              aria-label="Synchroniser"
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden />
              Synchroniser
            </button>
          </form>
        </header>

        {videos.length === 0 ? (
          <p className="text-caption text-muted mt-4">
            Aucune vidéo avec commentaires sur les 7 derniers jours. Lance un
            sync pour aspirer.
          </p>
        ) : (
          <ul className="mt-4 flex flex-col gap-3">
            {videos.map((v) => (
              <VideoRow key={v.videoId} video={v} />
            ))}
          </ul>
        )}

        {videos.length > 0 ? (
          <div className="mt-4 text-center">
            <Link
              href="/feed"
              className="text-caption text-primary hover:underline underline-offset-4"
            >
              Voir tous les commentaires dans le Clean Feed →
            </Link>
          </div>
        ) : null}
      </section>

      {breakdown.pending > 0 ? (
        <p className="text-caption text-muted text-center">
          {breakdown.pending} commentaire{breakdown.pending > 1 ? "s" : ""} en
          attente de classification — relance un sync.
        </p>
      ) : null}
    </div>
  );
}

type ExtendedBreakdown = CategoryBreakdown & { pending: number };

function aggregateBreakdown(
  rows: { category: string | null; is_toxic: boolean | null }[]
): ExtendedBreakdown {
  const b: ExtendedBreakdown = {
    question: 0,
    positive: 0,
    constructive: 0,
    neutral: 0,
    toxic: 0,
    total: 0,
    pending: 0,
  };
  for (const row of rows) {
    b.total += 1;
    if (row.is_toxic) b.toxic += 1;
    if (row.category === "question") b.question += 1;
    else if (row.category === "positive") b.positive += 1;
    else if (row.category === "constructive") b.constructive += 1;
    else if (row.category === "neutral") b.neutral += 1;
    else if (row.category === null) b.pending += 1;
  }
  return b;
}

function aggregateVideos(
  rows: Array<{
    video_id: string | null;
    video_title: string | null;
    category: string | null;
    is_toxic: boolean | null;
    published_at: string | null;
  }>
): VideoSummary[] {
  const groups = new Map<string, VideoSummary>();
  for (const row of rows) {
    if (!row.video_id) continue;
    let g = groups.get(row.video_id);
    if (!g) {
      g = {
        videoId: row.video_id,
        videoTitle: row.video_title,
        total: 0,
        questions: 0,
        positives: 0,
        hidden: 0,
        latestComment: row.published_at,
      };
      groups.set(row.video_id, g);
    }
    g.total += 1;
    if (row.is_toxic) g.hidden += 1;
    if (row.category === "question") g.questions += 1;
    if (row.category === "positive") g.positives += 1;
    if (
      row.published_at &&
      (!g.latestComment ||
        new Date(row.published_at) > new Date(g.latestComment))
    ) {
      g.latestComment = row.published_at;
    }
  }
  return Array.from(groups.values())
    .sort(
      (a, b) =>
        (b.latestComment ? new Date(b.latestComment).getTime() : 0) -
        (a.latestComment ? new Date(a.latestComment).getTime() : 0)
    )
    .slice(0, 5);
}
