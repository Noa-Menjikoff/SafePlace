import Link from "next/link";
import { Inbox, Filter, X, ShieldCheck } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAppContext } from "@/lib/auth-context";
import { CommentCard, type CommentRow } from "@/components/comment-card";
import {
  FeedFilters,
  type FeedFilter,
  type FilterCounts,
} from "@/components/feed-filters";
import { FILTER_MODE_META, isMaskedByFilter } from "@/lib/filter-mode";

export const dynamic = "force-dynamic";

const PERTINENCE: Record<string, number> = {
  question: 1,
  constructive: 2,
  positive: 3,
  neutral: 4,
};

function rankOf(c: CommentRow): number {
  if (c.is_masked || c.is_hidden) return 99;
  return PERTINENCE[c.category ?? ""] ?? 5;
}

export default async function FeedPage({
  searchParams,
}: {
  searchParams: { filter?: string; video?: string };
}) {
  const ctx = await getAppContext();
  const t = await getTranslations("feed");
  const supabase = createSupabaseServerClient();
  const channelIds = ctx.channels.map((c) => c.id);
  const filter = (searchParams.filter as FeedFilter) ?? "all";
  const videoId = searchParams.video ?? null;
  const filterMode = ctx.filterMode;

  if (channelIds.length === 0) {
    return (
      <div className="mx-auto max-w-3xl">
        <div className="ss-card p-10 text-center">
          <Inbox className="h-6 w-6 mx-auto text-muted" aria-hidden />
          <h1 className="text-h1 mt-4">{t("noChannelTitle")}</h1>
          <p className="text-muted mt-2">{t("noChannelDesc")}</p>
          <Link href="/settings" className="ss-button-primary mt-5 inline-flex">
            {t("noChannelCta")}
          </Link>
        </div>
      </div>
    );
  }

  // Récupère un large échantillon (cap 500) pour permettre filtrage + tri en JS.
  let query = supabase
    .from("comments")
    .select(
      "id, text, author_name, author_avatar, category, is_toxic, toxicity_score, is_hidden, is_saved_to_wall, published_at, video_id, video_title, threat_level"
    )
    .in("channel_id", channelIds);

  if (videoId) query = query.eq("video_id", videoId);

  const { data: rawComments } = await query
    .order("published_at", { ascending: false })
    .limit(500);

  const all = ((rawComments ?? []) as CommentRow[]).map((c) => ({
    ...c,
    is_masked: isMaskedByFilter(c, filterMode),
  }));

  const isVisible = (c: CommentRow) => !c.is_masked && !c.is_hidden;

  const counts: FilterCounts = {
    all: all.filter(isVisible).length,
    questions: all.filter((c) => c.category === "question" && isVisible(c)).length,
    positive: all.filter((c) => c.category === "positive" && isVisible(c)).length,
    constructive: all.filter((c) => c.category === "constructive" && isVisible(c))
      .length,
    neutral: all.filter((c) => c.category === "neutral" && isVisible(c)).length,
    hidden: all.filter((c) => c.is_masked || c.is_hidden).length,
  };

  let filtered: CommentRow[];
  switch (filter) {
    case "questions":
      filtered = all.filter((c) => c.category === "question" && isVisible(c));
      break;
    case "positive":
      filtered = all.filter((c) => c.category === "positive" && isVisible(c));
      break;
    case "constructive":
      filtered = all.filter(
        (c) => c.category === "constructive" && isVisible(c)
      );
      break;
    case "neutral":
      filtered = all.filter((c) => c.category === "neutral" && isVisible(c));
      break;
    case "hidden":
      filtered = all.filter((c) => c.is_masked || c.is_hidden);
      break;
    default:
      // Tous : non-cachés en haut par pertinence, masqués en bas (floutés)
      filtered = all
        .filter((c) => !c.is_hidden)
        .slice()
        .sort((a, b) => {
          const ra = rankOf(a);
          const rb = rankOf(b);
          if (ra !== rb) return ra - rb;
          const ta = a.published_at ? new Date(a.published_at).getTime() : 0;
          const tb = b.published_at ? new Date(b.published_at).getTime() : 0;
          return tb - ta;
        });
  }

  if (filter !== "all") {
    filtered = filtered.slice().sort((a, b) => {
      const ta = a.published_at ? new Date(a.published_at).getTime() : 0;
      const tb = b.published_at ? new Date(b.published_at).getTime() : 0;
      return tb - ta;
    });
  }

  const redirectTo = buildRedirect(filter, videoId);
  const videoTitle = videoId
    ? all.find((c) => c.video_id === videoId)?.video_title ?? null
    : null;
  const modeMeta = FILTER_MODE_META[filterMode];

  return (
    <div className="mx-auto max-w-3xl flex flex-col gap-6">
      <div>
        <h1 className="text-h1">{t("title")}</h1>
        <p className="text-muted text-body mt-1">{t("subtitle")}</p>
      </div>

      <Link
        href="/settings#niveau-filtrage"
        className="ss-card flex items-center gap-3 p-3 hover:bg-bg/30 transition-colors duration-200"
      >
        <ShieldCheck className="h-4 w-4 text-primary" aria-hidden />
        <p className="text-caption text-muted flex-1">
          Filtrage{" "}
          <span className="text-ink font-medium">{modeMeta.label}</span> ·
          {" "}{modeMeta.description}
        </p>
        <span className="text-caption text-primary">Modifier →</span>
      </Link>

      {videoId ? (
        <div className="ss-card flex items-center gap-3 p-3">
          <Filter className="h-4 w-4 text-primary" aria-hidden />
          <p className="text-caption text-muted flex-1">
            {t("filteredOnVideo", { title: videoTitle ?? videoId })}
          </p>
          <Link
            href={filter === "all" ? "/feed" : `/feed?filter=${filter}`}
            className="ss-button-ghost h-8 px-2 text-caption"
            aria-label={t("removeFilter")}
          >
            <X className="h-3.5 w-3.5" aria-hidden />
            {t("removeFilter")}
          </Link>
        </div>
      ) : null}

      <FeedFilters active={filter} counts={counts} videoId={videoId} />

      {filtered.length === 0 ? (
        <div className="ss-card p-10 text-center">
          <p className="text-body text-muted">
            {filter === "hidden" ? t("emptyHidden") : t("emptyCategory")}
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-4">
          {filtered.map((c) => (
            <li key={c.id}>
              <CommentCard comment={c} redirectTo={redirectTo} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function buildRedirect(filter: FeedFilter, videoId: string | null): string {
  const params = new URLSearchParams();
  if (filter !== "all") params.set("filter", filter);
  if (videoId) params.set("video", videoId);
  return "/feed" + (params.size ? `?${params.toString()}` : "");
}
