import Link from "next/link";
import { useTranslations } from "next-intl";
import { Lightbulb, Users, ArrowRight } from "lucide-react";
import type { Plan } from "@/lib/plans";
import { hasProFeatures } from "@/lib/plans";

export type DashboardTopicPreview = {
  id: string;
  label: string;
  question_count: number;
};

export function DashboardIdeasCard({
  topics,
  plan,
}: {
  topics: DashboardTopicPreview[];
  plan: Plan;
}) {
  const t = useTranslations("dashboard.ideas");
  const isPro = hasProFeatures(plan);

  // Upsell pour les users free — la feature est gated Pro.
  if (!isPro) {
    return (
      <section className="ss-card p-6 flex flex-col gap-3 border-primary/30">
        <header className="flex items-start justify-between gap-3">
          <div>
            <span className="ss-pill-primary inline-flex">
              <Lightbulb className="h-3.5 w-3.5" aria-hidden />
              {t("upsellTitle")}
            </span>
            <h2 className="text-h2 mt-2">{t("title")}</h2>
            <p className="text-caption text-muted mt-1">{t("upsellDesc")}</p>
          </div>
          <Link
            href="/settings?upgrade=1"
            className="ss-button-primary h-9 px-3 text-caption shrink-0"
          >
            {t("upsellCta")}
          </Link>
        </header>
      </section>
    );
  }

  return (
    <section className="ss-card p-6 flex flex-col gap-4">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-h2">{t("title")}</h2>
          <p className="text-caption text-muted mt-0.5">{t("subtitle")}</p>
        </div>
        <Link
          href="/ideas"
          className="ss-button-ghost h-9 px-3 text-caption shrink-0"
        >
          {t("viewAll")}
        </Link>
      </header>

      {topics.length === 0 ? (
        <p className="text-caption text-muted">{t("empty")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {topics.map((topic) => (
            <li key={topic.id}>
              <Link
                href="/ideas"
                className="group flex items-center gap-3 rounded-md border border-border bg-card p-3 hover:bg-surface transition-colors duration-200"
              >
                <span className="grid place-items-center h-9 w-9 rounded-md bg-primary-light text-primary shrink-0">
                  <Lightbulb className="h-4 w-4" aria-hidden />
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-body font-medium truncate">
                    {topic.label}
                  </p>
                  <p className="text-caption text-muted flex items-center gap-1 mt-0.5">
                    <Users className="h-3 w-3" aria-hidden />
                    {t("questionsCount", { count: topic.question_count })}
                  </p>
                </div>
                <ArrowRight
                  className="h-4 w-4 text-muted group-hover:text-primary shrink-0"
                  aria-hidden
                />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
