import {
  Heart,
  EyeOff,
  Eye,
  MessageCircleQuestion,
  Lightbulb,
  Circle,
  ExternalLink,
  ShieldAlert,
} from "lucide-react";
import { Avatar } from "@/components/avatar";
import { SuggestionsButton } from "@/components/suggestions-button";
import { relativeTimeFr } from "@/lib/format";
import { cn } from "@/lib/utils";

export type CommentRow = {
  id: string;
  text: string;
  author_name: string | null;
  author_avatar: string | null;
  category: string | null;
  is_toxic: boolean | null;
  toxicity_score: number | null;
  is_hidden: boolean | null;
  is_saved_to_wall: boolean | null;
  published_at: string | null;
  video_id: string | null;
  video_title: string | null;
  /** Set by the page based on the user's filter_mode. */
  is_masked?: boolean;
};

const CATEGORY_META: Record<
  string,
  { label: string; pillClass: string; icon: typeof Heart }
> = {
  positive: {
    label: "Positif",
    pillClass: "ss-pill-teal",
    icon: Heart,
  },
  question: {
    label: "Question",
    pillClass: "ss-pill-blue",
    icon: MessageCircleQuestion,
  },
  constructive: {
    label: "Critique",
    pillClass: "ss-pill-amber",
    icon: Lightbulb,
  },
  neutral: {
    label: "Neutre",
    pillClass: "ss-pill-primary",
    icon: Circle,
  },
};

export function CommentCard({
  comment,
  redirectTo = "/feed",
}: {
  comment: CommentRow;
  redirectTo?: string;
}) {
  const meta =
    (comment.category ? CATEGORY_META[comment.category] : null) ??
    CATEGORY_META.neutral;
  const Icon = meta.icon;
  const youtubeUrl = comment.video_id
    ? `https://www.youtube.com/watch?v=${comment.video_id}`
    : null;
  const masked = comment.is_masked ?? !!comment.is_toxic;

  return (
    <article
      className={cn(
        "ss-card p-5 flex flex-col gap-4",
        masked && "opacity-70"
      )}
      data-toxic={masked || undefined}
    >
      <header className="flex items-start gap-3">
        <Avatar
          src={comment.author_avatar}
          name={comment.author_name}
          size={40}
        />
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-body font-medium truncate">
              {comment.author_name ?? "Anonyme"}
            </span>
            <span className="text-caption text-muted">
              YouTube · {relativeTimeFr(comment.published_at)}
            </span>
            {masked ? (
              <span className="ss-pill bg-primary-light text-primary">
                <ShieldAlert className="h-3 w-3" aria-hidden />
                Toxicité masquée
              </span>
            ) : (
              <span className={meta.pillClass}>
                <Icon className="h-3 w-3" aria-hidden />
                {meta.label}
              </span>
            )}
            {comment.is_saved_to_wall ? (
              <span className="ss-pill-primary">
                <Heart className="h-3 w-3" aria-hidden />
                Sur le mur
              </span>
            ) : null}
          </div>
          {comment.video_title ? (
            <p className="text-caption text-muted mt-1 truncate">
              <span className="opacity-70">sur</span> {comment.video_title}
              {youtubeUrl ? (
                <a
                  href={youtubeUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-0.5 ml-1.5 text-primary/70 hover:text-primary"
                  aria-label="Ouvrir sur YouTube"
                >
                  <ExternalLink className="h-3 w-3" aria-hidden />
                </a>
              ) : null}
            </p>
          ) : null}
        </div>
      </header>

      <p
        className={cn(
          "text-body whitespace-pre-wrap",
          masked && "blur-sm select-none transition-[filter] duration-200 hover:blur-none"
        )}
      >
        {comment.text}
      </p>

      {masked ? (
        <p className="text-caption text-muted -mt-2">
          Survole pour révéler. Le commentaire reste visible sur YouTube — il
          est juste masqué dans ton flux.
        </p>
      ) : null}

      <footer className="flex flex-wrap items-center gap-2 pt-1">
        {!masked ? (
          <SuggestionsButton commentId={comment.id} />
        ) : null}

        {!comment.is_saved_to_wall && !masked ? (
          <form action="/api/comments/save-to-wall" method="post">
            <input type="hidden" name="commentId" value={comment.id} />
            <input type="hidden" name="redirectTo" value={redirectTo} />
            <button
              type="submit"
              className="ss-button-ghost h-9 px-3 text-caption"
            >
              <Heart className="h-3.5 w-3.5" aria-hidden />
              Mur de soutien
            </button>
          </form>
        ) : null}

        <form action="/api/comments/hide" method="post">
          <input type="hidden" name="commentId" value={comment.id} />
          <input
            type="hidden"
            name="action"
            value={comment.is_hidden ? "unhide" : "hide"}
          />
          <input type="hidden" name="redirectTo" value={redirectTo} />
          <button type="submit" className="ss-button-ghost h-9 px-3 text-caption">
            {comment.is_hidden ? (
              <>
                <Eye className="h-3.5 w-3.5" aria-hidden />
                Réafficher
              </>
            ) : (
              <>
                <EyeOff className="h-3.5 w-3.5" aria-hidden />
                Masquer
              </>
            )}
          </button>
        </form>
      </footer>
    </article>
  );
}
