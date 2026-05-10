import { Sparkles, RefreshCw, MessageCircleQuestion, Heart, Lightbulb } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TldrInsight } from "@/lib/gemini";
import { moodLabelFr, type Mood } from "@/lib/score";
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

const CATEGORY_META: Record<
  TldrInsight["category"],
  { label: string; bar: string; bg: string; text: string; icon: typeof Heart }
> = {
  positive: {
    label: "Positif",
    bar: "bg-teal",
    bg: "bg-teal-light",
    text: "text-teal",
    icon: Heart,
  },
  question: {
    label: "Question",
    bar: "bg-blue",
    bg: "bg-blue-light",
    text: "text-blue",
    icon: MessageCircleQuestion,
  },
  constructive: {
    label: "Critique",
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

export function TldrCard({
  insights,
  rawCount,
  generatedAt,
  mood,
  onRefreshAction,
  channelId,
  notice,
}: TldrCardProps) {
  const hasInsights = !!insights && insights.length > 0;

  return (
    <section className="ss-card p-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <span className="ss-pill-primary">
            <Sparkles className="h-3.5 w-3.5" aria-hidden />
            Résumé de la semaine
          </span>
          <h2 className="text-h2 mt-3">
            {hasInsights
              ? "Ce que ta communauté te dit"
              : "Ton premier résumé est à un clic"}
          </h2>
          {hasInsights ? (
            <p className="text-caption text-muted mt-1">
              Analysé {relativeTimeFr(generatedAt)} ·{" "}
              {(rawCount ?? 0).toLocaleString("fr-FR")} commentaires ·
              <span
                className={cn(
                  "ml-2 inline-flex items-center rounded-full px-2 py-0.5 font-medium",
                  MOOD_PALETTE[mood]
                )}
              >
                {moodLabelFr(mood)}
              </span>
            </p>
          ) : (
            <p className="text-caption text-muted mt-1">
              {notice === "insufficient"
                ? "Pas encore assez de commentaires classés (minimum 5). Lance un sync."
                : "Génère le TL;DR de tes 7 derniers jours via Gemini."}
            </p>
          )}
        </div>

        <form action={onRefreshAction} method="post" className="shrink-0">
          {channelId ? (
            <input type="hidden" name="channelId" value={channelId} />
          ) : null}
          <input type="hidden" name="redirect" value="1" />
          <button type="submit" className="ss-button-ghost h-9 px-3 text-caption">
            <RefreshCw className="h-3.5 w-3.5" aria-hidden />
            {hasInsights ? "Régénérer" : "Générer"}
          </button>
        </form>
      </header>

      {notice === "error" ? (
        <p className="mt-3 text-caption text-amber">
          La génération a échoué. Réessaie dans un instant.
        </p>
      ) : null}

      {hasInsights ? (
        <ul className="mt-5 flex flex-col gap-3">
          {insights.map((i, idx) => {
            const meta = CATEGORY_META[i.category] ?? CATEGORY_META.positive;
            const Icon = meta.icon;
            const percent = Math.max(0, Math.min(100, i.percent));
            return (
              <li
                key={idx}
                className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4"
              >
                <span
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-caption font-medium shrink-0",
                    meta.bg,
                    meta.text
                  )}
                >
                  <Icon className="h-3 w-3" aria-hidden />
                  {meta.label}
                </span>
                <span className="flex-1 text-body">{i.label}</span>
                <div className="flex items-center gap-3 sm:w-44">
                  <div className="h-1.5 flex-1 rounded-full bg-bg overflow-hidden">
                    <div
                      className={cn("h-full transition-all duration-200", meta.bar)}
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
