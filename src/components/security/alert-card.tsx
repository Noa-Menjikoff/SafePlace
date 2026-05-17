import { useTranslations } from "next-intl";
import { ExternalLink, Archive, UserX } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { SeverityBadge, type Severity } from "@/components/security/severity-badge";
import { relativeTimeFr } from "@/lib/format";

export type AlertRow = {
  id: string;
  alert_type: "pii" | "stalker" | "raid" | "threat";
  severity: number;
  payload: { categories?: string[]; excerpt?: string } | null;
  created_at: string | null;
  comment: {
    id: string;
    text: string;
    author_name: string | null;
    author_avatar: string | null;
    video_id: string | null;
    video_title: string | null;
    platform_author_id: string | null;
  } | null;
  /** Profil stalker associé à l'auteur du commentaire (s'il existe). */
  stalker?: { id: string; blocked: boolean } | null;
};

export function AlertCard({
  alert,
  redirectTo,
}: {
  alert: AlertRow;
  redirectTo: string;
}) {
  const t = useTranslations("security.alerts");
  const tType = useTranslations("security.alerts.type");
  const tCat = useTranslations("security.alerts.category");

  const severity = clampLevel(alert.severity);
  const comment = alert.comment;
  const categories = (alert.payload?.categories ?? []).filter(
    (c) => typeof c === "string"
  );
  const excerpt = alert.payload?.excerpt ?? "";

  const youtubeUrl = comment?.video_id
    ? `https://www.youtube.com/watch?v=${comment.video_id}&lc=${comment.id}`
    : null;

  return (
    <article className="ss-card p-5 flex flex-col gap-4">
      <header className="flex items-start gap-3">
        {comment ? (
          <Avatar
            src={comment.author_avatar}
            name={comment.author_name}
            size={40}
          />
        ) : null}
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <SeverityBadge level={severity} />
            <span className="text-caption text-muted">
              {tType(alert.alert_type)}
            </span>
            {comment?.author_name ? (
              <span className="text-body font-medium truncate">
                {comment.author_name}
              </span>
            ) : null}
            <span className="text-caption text-muted">
              · {relativeTimeFr(alert.created_at)}
            </span>
          </div>
          {comment?.video_title ? (
            <p className="text-caption text-muted mt-1 truncate">
              <span className="opacity-70">sur</span> {comment.video_title}
            </p>
          ) : null}
        </div>
      </header>

      {excerpt ? (
        <p className="text-caption text-muted italic">{excerpt}</p>
      ) : null}

      {comment ? (
        <p className="text-body whitespace-pre-wrap text-ink/90 line-clamp-4">
          {comment.text}
        </p>
      ) : null}

      {categories.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5">
          {categories.map((c) => (
            <li
              key={c}
              className="ss-pill bg-card text-muted text-caption border border-border"
            >
              {safeCategoryLabel(tCat, c)}
            </li>
          ))}
        </ul>
      ) : null}

      <footer className="flex flex-wrap items-center gap-2 pt-1">
        {youtubeUrl ? (
          <a
            href={youtubeUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="ss-button-ghost h-9 px-3 text-caption"
          >
            <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            {t("openYoutube")}
          </a>
        ) : null}

        {alert.stalker && !alert.stalker.blocked ? (
          <form
            action={`/api/stalkers/${alert.stalker.id}/block`}
            method="post"
          >
            <input type="hidden" name="action" value="block" />
            <input type="hidden" name="redirectTo" value={redirectTo} />
            <button
              type="submit"
              className="ss-button-ghost h-9 px-3 text-caption"
            >
              <UserX className="h-3.5 w-3.5" aria-hidden />
              {t("blockAuthor")}
            </button>
          </form>
        ) : null}

        <form action="/api/threats/dismiss" method="post" className="ml-auto">
          <input type="hidden" name="alertId" value={alert.id} />
          <input type="hidden" name="redirectTo" value={redirectTo} />
          <button
            type="submit"
            className="ss-button-ghost h-9 px-3 text-caption"
          >
            <Archive className="h-3.5 w-3.5" aria-hidden />
            {t("dismiss")}
          </button>
        </form>
      </footer>
    </article>
  );
}

function clampLevel(n: number): Severity {
  if (n <= 0) return 0;
  if (n >= 3) return 3;
  return Math.round(n) as 1 | 2;
}

/** next-intl jette si la clé manque — on retombe sur la string brute. */
function safeCategoryLabel(
  t: ReturnType<typeof useTranslations>,
  key: string
): string {
  try {
    return t(key);
  } catch {
    return key;
  }
}
