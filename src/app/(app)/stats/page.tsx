import Link from "next/link";
import { BarChart3, Download, Inbox } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { fetchStats } from "@/lib/stats";
import { CommunityScoreChart } from "@/components/stats/community-score-chart";
import { TopicsChart } from "@/components/stats/topics-chart";
import { PeakHoursChart } from "@/components/stats/peak-hours-chart";
import { RatioCard } from "@/components/stats/ratio-card";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const VALID_WINDOWS = [30, 90] as const;
type Window = (typeof VALID_WINDOWS)[number];

export default async function StatsPage({
  searchParams,
}: {
  searchParams: { window?: string };
}) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const requestedWindow = Number(searchParams.window);
  const windowDays: Window = (
    VALID_WINDOWS as readonly number[]
  ).includes(requestedWindow)
    ? (requestedWindow as Window)
    : 30;

  const { data: channels } = await supabase
    .from("channels")
    .select("id")
    .eq("user_id", user!.id);
  const channelIds = (channels ?? []).map((c) => c.id);

  if (channelIds.length === 0) {
    return (
      <div className="mx-auto max-w-3xl">
        <div className="ss-card p-10 text-center">
          <Inbox className="h-6 w-6 mx-auto text-muted" aria-hidden />
          <h1 className="text-h1 mt-4">Aucune chaîne connectée</h1>
          <p className="text-muted mt-2">
            Connecte ta chaîne YouTube pour voir tes stats.
          </p>
          <Link href="/settings" className="ss-button-primary mt-5 inline-flex">
            Aller aux réglages
          </Link>
        </div>
      </div>
    );
  }

  const stats = await fetchStats(supabase, channelIds, windowDays);

  return (
    <div className="mx-auto max-w-5xl flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <span className="ss-pill-primary inline-flex w-fit">
          <BarChart3 className="h-3.5 w-3.5" aria-hidden />
          Plan Pro
        </span>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-h1">Stats protégées</h1>
            <p className="text-muted text-body">
              Score communauté, ratio positif/négatif, topics demandés et
              heures de pointe — sans badges anxiogènes.
            </p>
          </div>
          <a
            href="/api/stats/export"
            className="ss-button-ghost"
            download
          >
            <Download className="h-4 w-4" aria-hidden />
            Export CSV
          </a>
        </div>
      </header>

      <WindowSwitcher active={windowDays} />

      <section className="grid gap-4 lg:grid-cols-3">
        <div className="ss-card p-5 lg:col-span-2 flex flex-col gap-4">
          <header className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-h2">Score communauté</h2>
              <p className="text-caption text-muted">
                Sur les {windowDays} derniers jours · 0–100
              </p>
            </div>
          </header>
          <CommunityScoreChart daily={stats.daily} />
        </div>

        <RatioCard
          current={stats.current}
          previous={stats.previous}
          windowDays={windowDays}
        />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="ss-card p-5 flex flex-col gap-4">
          <header>
            <h2 className="text-h2">Topics les plus demandés</h2>
            <p className="text-caption text-muted">
              Mots-clés extraits des questions
            </p>
          </header>
          <TopicsChart topics={stats.topQuestions} />
        </div>

        <div className="ss-card p-5 flex flex-col gap-4">
          <header>
            <h2 className="text-h2">Heures de pointe</h2>
            <p className="text-caption text-muted">
              Distribution des commentaires sur 24h (UTC)
            </p>
          </header>
          <PeakHoursChart hourly={stats.hourly} />
        </div>
      </section>
    </div>
  );
}

function WindowSwitcher({ active }: { active: Window }) {
  return (
    <div
      role="tablist"
      className="inline-flex items-center gap-1 p-1 rounded-md border border-border bg-card w-fit"
    >
      {VALID_WINDOWS.map((d) => {
        const isActive = d === active;
        return (
          <Link
            key={d}
            role="tab"
            aria-selected={isActive}
            href={`/stats?window=${d}`}
            className={cn(
              "inline-flex items-center rounded-md px-3 h-8 text-caption font-medium transition-colors duration-200 ease-out-soft",
              isActive
                ? "bg-primary-light text-primary"
                : "text-muted hover:text-ink hover:bg-bg/50"
            )}
          >
            {d} jours
          </Link>
        );
      })}
    </div>
  );
}
