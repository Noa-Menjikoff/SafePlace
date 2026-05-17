import { useTranslations } from "next-intl";
import { UserX, UserCheck, Lock } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { relativeTimeFr } from "@/lib/format";
import { cn } from "@/lib/utils";

export type StalkerRowData = {
  id: string;
  platform_author_id: string;
  author_name: string | null;
  author_avatar: string | null;
  comment_count: number;
  negative_count: number;
  threat_count: number;
  risk_score: number;
  first_seen: string;
  last_seen: string;
  blocked: boolean;
};

export function StalkerRow({
  stalker,
  redirectTo,
}: {
  stalker: StalkerRowData;
  redirectTo: string;
}) {
  const t = useTranslations("security.stalkers");
  const ratio =
    stalker.comment_count > 0
      ? Math.round((stalker.negative_count / stalker.comment_count) * 100)
      : 0;

  const riskTier = riskFromScore(stalker.risk_score);

  return (
    <article className="ss-card p-5 flex flex-col sm:flex-row sm:items-center gap-4">
      <Avatar
        src={stalker.author_avatar}
        name={stalker.author_name}
        size={48}
      />
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-body font-medium truncate">
            {stalker.author_name ?? stalker.platform_author_id}
          </span>
          <span
            className={cn(
              "ss-pill",
              riskTier === "high"
                ? "bg-amber text-white"
                : riskTier === "moderate"
                  ? "bg-amber-light text-amber"
                  : "bg-primary-light text-primary"
            )}
          >
            {riskTier === "high"
              ? t("riskHigh")
              : riskTier === "moderate"
                ? t("riskModerate")
                : t("riskLow")}
          </span>
          {stalker.blocked ? (
            <span className="ss-pill bg-card text-muted border border-border">
              <Lock className="h-3 w-3" aria-hidden />
              {t("blocked")}
            </span>
          ) : null}
        </div>
        <div className="text-caption text-muted mt-1 flex flex-wrap gap-x-3 gap-y-1">
          <span>{t("comments", { count: stalker.comment_count })}</span>
          {ratio > 0 ? (
            <span>{t("negativeRatio", { percent: ratio })}</span>
          ) : null}
          {stalker.threat_count > 0 ? (
            <span>{t("threats", { count: stalker.threat_count })}</span>
          ) : null}
          <span>·</span>
          <span>{t("firstSeen", { time: relativeTimeFr(stalker.first_seen) })}</span>
          <span>{t("lastSeen", { time: relativeTimeFr(stalker.last_seen) })}</span>
        </div>
      </div>

      <form
        action={`/api/stalkers/${stalker.id}/block`}
        method="post"
        className="shrink-0"
      >
        <input
          type="hidden"
          name="action"
          value={stalker.blocked ? "unblock" : "block"}
        />
        <input type="hidden" name="redirectTo" value={redirectTo} />
        <button
          type="submit"
          className="ss-button-ghost h-9 px-3 text-caption"
        >
          {stalker.blocked ? (
            <>
              <UserCheck className="h-3.5 w-3.5" aria-hidden />
              {t("unblock")}
            </>
          ) : (
            <>
              <UserX className="h-3.5 w-3.5" aria-hidden />
              {t("block")}
            </>
          )}
        </button>
      </form>
    </article>
  );
}

function riskFromScore(score: number): "high" | "moderate" | "low" {
  if (score >= 0.5) return "high";
  if (score >= 0.2) return "moderate";
  return "low";
}
