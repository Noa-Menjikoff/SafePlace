import Link from "next/link";
import { Sparkles, Lightbulb, Check } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAppContext } from "@/lib/auth-context";
import { TopicCard, type TopicRow } from "@/components/ideas/topic-card";

export const dynamic = "force-dynamic";

const VALID_STATUSES = ["pending", "answered", "dismissed"] as const;
type TopicStatus = (typeof VALID_STATUSES)[number];

type SearchParams = {
  status?: string;
  cluster?: string;
  created?: string;
  updated?: string;
};

export default async function IdeasPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const ctx = await getAppContext();
  const t = await getTranslations("ideas");
  const tTabs = await getTranslations("ideas.tabs");
  const tEmpty = await getTranslations("ideas.empty");
  const supabase = createSupabaseServerClient();

  const status: TopicStatus = VALID_STATUSES.includes(
    searchParams.status as TopicStatus
  )
    ? (searchParams.status as TopicStatus)
    : "pending";

  const channelIds = ctx.channels.map((c) => c.id);
  const hasChannel = channelIds.length > 0;

  // Compteurs pour les onglets — un count() par statut.
  const [pendingCount, answeredCount, dismissedCount, topicsRes] =
    await Promise.all([
      hasChannel
        ? supabase
            .from("question_topics")
            .select("id", { count: "exact", head: true })
            .in("channel_id", channelIds)
            .eq("status", "pending")
        : Promise.resolve({ count: 0 }),
      hasChannel
        ? supabase
            .from("question_topics")
            .select("id", { count: "exact", head: true })
            .in("channel_id", channelIds)
            .eq("status", "answered")
        : Promise.resolve({ count: 0 }),
      hasChannel
        ? supabase
            .from("question_topics")
            .select("id", { count: "exact", head: true })
            .in("channel_id", channelIds)
            .eq("status", "dismissed")
        : Promise.resolve({ count: 0 }),
      hasChannel
        ? supabase
            .from("question_topics")
            .select(
              "id, label, example_text, question_count, first_seen_at, last_seen_at, status, answered_video_id, answered_at"
            )
            .in("channel_id", channelIds)
            .eq("status", status)
            .order("question_count", { ascending: false })
            .order("last_seen_at", { ascending: false })
            .limit(100)
        : Promise.resolve({ data: [] as TopicRow[] }),
    ]);

  const topics = (topicsRes.data ?? []) as TopicRow[];

  // Pour les topics pending : compte les commentaires non répondus rattachés
  // → utile au TopicReplyForm ("Envoyer à N personnes")
  const pendingByTopic = new Map<string, number>();
  if (status === "pending" && topics.length > 0) {
    const { data: counts } = await supabase
      .from("comments")
      .select("topic_id")
      .in(
        "topic_id",
        topics.map((t) => t.id)
      )
      .is("replied_at", null);
    for (const row of counts ?? []) {
      const id = row.topic_id as string | null;
      if (!id) continue;
      pendingByTopic.set(id, (pendingByTopic.get(id) ?? 0) + 1);
    }
  }

  const counts = {
    pending: pendingCount.count ?? 0,
    answered: answeredCount.count ?? 0,
    dismissed: dismissedCount.count ?? 0,
  };

  const redirectTo = `/ideas?status=${status}`;

  return (
    <div className="mx-auto max-w-4xl flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <span className="ss-pill-primary inline-flex w-fit">
          <Lightbulb className="h-3.5 w-3.5" aria-hidden />
          {t("title")}
        </span>
        <h1 className="text-h1">{t("title")}</h1>
        <p className="text-muted text-body">{t("subtitle")}</p>
      </header>

      {searchParams.cluster === "done" ? (
        <ClusterDoneBanner
          created={Number(searchParams.created ?? 0)}
          updated={Number(searchParams.updated ?? 0)}
        />
      ) : null}

      {/* Onglets de statut + bouton refresh */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border">
        <nav
          className="flex flex-wrap gap-1 -mb-px"
          aria-label="Topic status"
        >
          {VALID_STATUSES.map((s) => {
            const isActive = status === s;
            const count = counts[s];
            return (
              <Link
                key={s}
                href={`/ideas?status=${s}`}
                className={
                  isActive
                    ? "inline-flex items-center gap-2 px-4 py-2.5 text-body border-b-2 border-primary text-ink"
                    : "inline-flex items-center gap-2 px-4 py-2.5 text-body border-b-2 border-transparent text-muted hover:text-ink"
                }
              >
                <span>{tTabs(s)}</span>
                {count > 0 ? (
                  <span
                    className={
                      isActive
                        ? "ml-1 inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full text-caption font-medium bg-primary-light text-primary"
                        : "ml-1 inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full text-caption font-medium bg-card text-muted"
                    }
                  >
                    {count}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </nav>

        <form action="/api/ai/cluster-topics" method="post" className="pb-1">
          <input type="hidden" name="redirectTo" value={redirectTo} />
          <button
            type="submit"
            className="ss-button-ghost h-9 px-3 text-caption"
          >
            <Sparkles className="h-3.5 w-3.5" aria-hidden />
            {t("cluster")}
          </button>
        </form>
      </div>

      {topics.length === 0 ? (
        <div className="ss-card p-8 text-center">
          <p className="text-body font-medium">{tEmpty(status)}</p>
          {status === "pending" ? (
            <p className="text-caption text-muted mt-1">
              {tEmpty("pendingHint")}
            </p>
          ) : null}
        </div>
      ) : (
        <ul className="flex flex-col gap-4">
          {topics.map((topic) => (
            <li key={topic.id}>
              <TopicCard
                topic={{
                  ...topic,
                  pending_replies: pendingByTopic.get(topic.id) ?? 0,
                }}
                redirectTo={redirectTo}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

async function ClusterDoneBanner({
  created,
  updated,
}: {
  created: number;
  updated: number;
}) {
  const t = await getTranslations("ideas");
  const message =
    created === 0 && updated === 0
      ? t("clusterDoneNone")
      : t("clusterDoneCreated", { count: created }) +
        (updated > 0 ? t("clusterDoneUpdated", { count: updated }) : "");
  return (
    <div className="ss-card flex items-start gap-3 border-teal/30 bg-teal-light p-4">
      <Check className="h-4 w-4 mt-0.5 text-teal" aria-hidden />
      <p className="text-body text-teal font-medium">{message}</p>
    </div>
  );
}
