import { ArrowDown, ArrowUp, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PeriodSummary } from "@/lib/stats";

export function RatioCard({
  current,
  previous,
  windowDays,
}: {
  current: PeriodSummary;
  previous: PeriodSummary;
  windowDays: number;
}) {
  const ratioPct = Math.round(current.positiveRatio * 100);
  const previousPct = Math.round(previous.positiveRatio * 100);
  const delta = ratioPct - previousPct;

  const Icon = delta === 0 ? Minus : delta > 0 ? ArrowUp : ArrowDown;
  const deltaTone =
    delta === 0
      ? "text-muted bg-bg/40"
      : delta > 0
      ? "text-teal bg-teal-light"
      : "text-amber bg-amber-light";

  const totalCompare = current.total - previous.total;

  return (
    <div className="ss-card p-5 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-caption text-muted">Ratio positif / négatif</span>
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-caption font-medium",
            deltaTone
          )}
        >
          <Icon className="h-3 w-3" aria-hidden />
          {delta === 0 ? "stable" : `${delta > 0 ? "+" : ""}${delta} pts`}
        </span>
      </div>

      <div className="flex items-baseline gap-2">
        <span className="text-h1 tabular-nums font-medium text-primary">
          {ratioPct}%
        </span>
        <span className="text-caption text-muted">de positifs</span>
      </div>

      <div className="grid grid-cols-2 gap-3 text-caption text-muted">
        <div>
          <p className="text-ink font-medium tabular-nums">
            {current.positive.toLocaleString("fr-FR")}
          </p>
          <p>positifs sur {windowDays}j</p>
        </div>
        <div>
          <p className="text-ink font-medium tabular-nums">
            {current.negative.toLocaleString("fr-FR")}
          </p>
          <p>critiques + toxiques</p>
        </div>
      </div>

      <p className="text-caption text-muted pt-2 border-t border-border">
        Période précédente : {previousPct}% positifs
        {previous.total > 0
          ? ` (${previous.total} commentaires) ·  ${
              totalCompare >= 0 ? "+" : ""
            }${totalCompare} ce mois`
          : ""}
      </p>
    </div>
  );
}
