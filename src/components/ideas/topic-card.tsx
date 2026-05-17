import { useTranslations } from "next-intl";
import { Check, X, Users } from "lucide-react";
import { TopicReplyForm } from "@/components/ideas/topic-reply-form";
import { relativeTimeFr } from "@/lib/format";

export type TopicRow = {
  id: string;
  label: string;
  example_text: string | null;
  question_count: number;
  first_seen_at: string;
  last_seen_at: string;
  status: "pending" | "answered" | "dismissed";
  answered_video_id: string | null;
  answered_at: string | null;
  /** Nombre de commentaires du topic encore sans réponse (calculé côté page). */
  pending_replies?: number;
};

export function TopicCard({
  topic,
  redirectTo,
}: {
  topic: TopicRow;
  redirectTo: string;
}) {
  const t = useTranslations("ideas.card");
  const pendingReplies = topic.pending_replies ?? 0;
  const youtubeUrl = topic.answered_video_id
    ? `https://www.youtube.com/watch?v=${topic.answered_video_id}`
    : null;

  return (
    <article className="ss-card p-5 flex flex-col gap-4">
      <header className="flex flex-col gap-2">
        <h3 className="text-h2">{topic.label}</h3>
        <div className="flex flex-wrap items-center gap-2 text-caption text-muted">
          <span className="inline-flex items-center gap-1">
            <Users className="h-3.5 w-3.5" aria-hidden />
            {t("questionsCount", { count: topic.question_count })}
          </span>
          <span>·</span>
          <span>{t("firstSeen", { time: relativeTimeFr(topic.first_seen_at) })}</span>
          <span>{t("lastSeen", { time: relativeTimeFr(topic.last_seen_at) })}</span>
          {topic.status === "answered" && topic.answered_at ? (
            <>
              <span>·</span>
              <span className="text-teal">
                {t("answeredAt", { time: relativeTimeFr(topic.answered_at) })}
              </span>
            </>
          ) : null}
        </div>
      </header>

      {topic.example_text ? (
        <blockquote
          className="border-l-2 border-primary pl-4 py-1 text-body italic"
          style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}
        >
          <p className="text-caption text-muted not-italic mb-1">
            {t("exampleLabel")}
          </p>
          {topic.example_text}
        </blockquote>
      ) : null}

      {topic.status === "answered" && youtubeUrl ? (
        <a
          href={youtubeUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-caption text-primary hover:underline underline-offset-4"
        >
          Voir la vidéo qui a répondu →
        </a>
      ) : null}

      {topic.status === "pending" ? (
        <footer className="flex flex-wrap items-center gap-2 pt-1">
          <TopicReplyForm
            topicId={topic.id}
            pendingCount={pendingReplies}
          />

          <form
            action={`/api/topics/${topic.id}/mark-answered`}
            method="post"
          >
            <input type="hidden" name="redirectTo" value={redirectTo} />
            <button
              type="submit"
              className="ss-button-ghost h-9 px-3 text-caption"
            >
              <Check className="h-3.5 w-3.5" aria-hidden />
              {t("markAnswered")}
            </button>
          </form>

          <form
            action={`/api/topics/${topic.id}/dismiss`}
            method="post"
            className="ml-auto"
          >
            <input type="hidden" name="redirectTo" value={redirectTo} />
            <button
              type="submit"
              className="ss-button-ghost h-9 px-3 text-caption"
            >
              <X className="h-3.5 w-3.5" aria-hidden />
              {t("dismiss")}
            </button>
          </form>
        </footer>
      ) : null}
    </article>
  );
}
