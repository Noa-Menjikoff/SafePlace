import { getTranslations } from "next-intl/server";
import {
  Sparkles,
  RefreshCw,
  MessageCircleQuestion,
  Heart,
  Lightbulb,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { TldrInsight } from "@/lib/gemini";
import type { Mood } from "@/lib/score";
import { relativeTimeFr } from "@/lib/format";

type TldrCardProps = {
  insights: TldrInsight[] | null;
  rawCount: number | null;
  generatedAt: string | null;
  mood: Mood;
  onRefreshAction: string;
  channelId: string | null;
  notice?: "done" | "insufficient" | "error" | "no_channel" | null;
};

const CATEGORY_STYLE: Record<
  TldrInsight["category"],
  { bar: string; bg: string; text: string; icon: typeof Heart }
> = {
  positive: {
    bar: "bg-teal",
    bg: "bg-teal-light",
    text: "text-teal",
    icon: Heart,
  },
  question: {
    bar: "bg-blue",
    bg: "bg-blue-light",
    text: "text-blue",
    icon: MessageCircleQuestion,
  },
  constructive: {
    bar: "bg-amber",
    bg: "bg-amber-light",
    text: "text-amber",
    icon: Lightbulb,
  },
};

const MOOD_PALETTE: Record<Mood, string> = {
  positive: "bg-teal-light text-teal",
  neutral: "bg-primary-light text-primary",
  tense: "bg-amber-light text-amber",
};

export async function TldrCard({
  insights,
  rawCount,
  generatedAt,
  mood,
  onRefreshAction,
  channelId,
  notice,
}: TldrCardProps) {
  const t = await getTranslations("tldr");
  const hasInsights = !!insights && insights.length > 0;

  return (
    <section className="ss-card p-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <span className="ss-pill-primary">
            <Sparkles className="h-3.5 w-3.5" aria-hidden />
            {t("badge")}
          </span>
          <h2 className="text-h2 mt-3">
            {hasInsights ? t("titleWithInsights") : t("titleEmpty")}
          </h2>
          {hasInsights ? (
            <p className="text-caption text-muted mt-1">
              {t("subtitle", {
                time: relativeTimeFr(generatedAt),
                count: rawCount ?? 0,
              })}
              <span
                className={cn(
                  "ml-2 inline-flex items-center rounded-full px-2 py-0.5 font-medium",
                  MOOD_PALETTE[mood]
                )}
              >
                {t(`moods.${mood}`)}
              </span>
            </p>
          ) : (
            <p className="text-caption text-muted mt-1">
              {notice === "insufficient"
                ? t("noticeInsufficient")
                : t("noticeEmpty")}
            </p>
          )}
        </div>

        <form action={onRefreshAction} method="post" className="shrink-0">
          {channelId ? (
            <input type="hidden" name="channelId" value={channelId} />
          ) : null}
          <input type="hidden" name="redirect" value="1" />
          <button
            type="submit"
            className="ss-button-ghost h-9 px-3 text-caption"
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden />
            {hasInsights ? t("regenerate") : t("generate")}
          </button>
        </form>
      </header>

      {notice === "error" ? (
        <p className="mt-3 text-caption text-amber">{t("errorGeneration")}</p>
      ) : null}

      {hasInsights ? (
        <ul className="mt-5 flex flex-col gap-3">
          {insights.map((i, idx) => {
            const style = CATEGORY_STYLE[i.category] ?? CATEGORY_STYLE.positive;
            const Icon = style.icon;
            const percent = Math.max(0, Math.min(100, i.percent));
            return (
              <li
                key={idx}
                className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4"
              >
                <span
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-caption font-medium shrink-0",
                    style.bg,
                    style.text
                  )}
                >
                  <Icon className="h-3 w-3" aria-hidden />
                  {t(`categories.${i.category}`)}
                </span>
                <span className="flex-1 text-body">{i.label}</span>
                <div className="flex items-center gap-3 sm:w-44">
                  <div className="h-1.5 flex-1 rounded-full bg-bg overflow-hidden">
                    <div
                      className={cn(
                        "h-full transition-all duration-200",
                        style.bar
                      )}
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                  <span className="text-caption text-muted w-9 text-right">
                    {percent}%
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}
