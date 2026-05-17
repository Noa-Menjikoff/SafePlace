import {
  Sparkles,
  Shield,
  ShieldAlert,
  Zap as ZapIcon,
  Check,
} from "lucide-react";
import { getTranslations } from "next-intl/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAppContext } from "@/lib/auth-context";
import {
  SecurityTabs,
  type SecurityTab,
} from "@/components/security/security-tabs";
import { AlertCard, type AlertRow } from "@/components/security/alert-card";
import {
  StalkerRow,
  type StalkerRowData,
} from "@/components/security/stalker-row";
import { EmailPrefsForm } from "@/components/security/email-prefs-form";
import { relativeTimeFr } from "@/lib/format";

export const dynamic = "force-dynamic";

const VALID_TABS: SecurityTab[] = ["alerts", "stalkers", "raids", "settings"];
const VALID_FILTERS = ["active", "dismissed", "all"] as const;
type AlertFilter = (typeof VALID_FILTERS)[number];

type SearchParams = {
  tab?: string;
  filter?: string;
  scan?: string;
  flagged?: string;
};

export default async function SecurityPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const ctx = await getAppContext();
  const t = await getTranslations("security");
  const supabase = createSupabaseServerClient();

  const tab: SecurityTab = VALID_TABS.includes(
    searchParams.tab as SecurityTab
  )
    ? (searchParams.tab as SecurityTab)
    : "alerts";

  const filter: AlertFilter = VALID_FILTERS.includes(
    searchParams.filter as AlertFilter
  )
    ? (searchParams.filter as AlertFilter)
    : "active";

  const channelIds = ctx.channels.map((c) => c.id);
  const hasChannel = channelIds.length > 0;

  // Compteurs pour les badges des onglets — minimaux pour ne pas
  // exploser sur des chaînes très actives.
  const [alertsCountRes, stalkersCountRes, raidsCountRes, prefsRes] =
    await Promise.all([
      supabase
        .from("threat_alerts")
        .select("id", { count: "exact", head: true })
        .eq("user_id", ctx.user.id)
        .neq("alert_type", "raid")
        .eq("dismissed", false),
      hasChannel
        ? supabase
            .from("stalker_profiles")
            .select("id", { count: "exact", head: true })
            .in("channel_id", channelIds)
            .gte("risk_score", 0.2)
        : Promise.resolve({ count: 0 }),
      supabase
        .from("threat_alerts")
        .select("id", { count: "exact", head: true })
        .eq("user_id", ctx.user.id)
        .eq("alert_type", "raid")
        .eq("dismissed", false),
      supabase
        .from("profiles")
        .select("alerts_email_mode, alerts_min_severity")
        .eq("id", ctx.user.id)
        .maybeSingle(),
    ]);

  const counts = {
    alerts: alertsCountRes.count ?? 0,
    stalkers: stalkersCountRes.count ?? 0,
    raids: raidsCountRes.count ?? 0,
  };

  const headerSubtitle =
    counts.alerts + counts.raids > 0
      ? t("subtitle")
      : t("alerts.emptyHint");

  return (
    <div className="mx-auto max-w-5xl flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <span className="ss-pill-primary">
            <Shield className="h-3.5 w-3.5" aria-hidden />
            {t("title")}
          </span>
        </div>
        <h1 className="text-h1">{t("title")}</h1>
        <p className="text-muted text-body">{headerSubtitle}</p>
      </header>

      <SecurityTabs active={tab} counts={counts} />

      {searchParams.scan === "done" ? (
        <ScanDoneBanner flagged={Number(searchParams.flagged ?? 0)} />
      ) : null}

      {tab === "alerts" ? (
        <AlertsTab
          userId={ctx.user.id}
          filter={filter}
        />
      ) : null}

      {tab === "stalkers" ? (
        <StalkersTab channelIds={channelIds} />
      ) : null}

      {tab === "raids" ? (
        <RaidsTab userId={ctx.user.id} />
      ) : null}

      {tab === "settings" ? (
        <EmailPrefsForm
          initialMode={
            (prefsRes.data?.alerts_email_mode as
              | "immediate"
              | "digest_daily"
              | "digest_weekly"
              | "off") ?? "digest_daily"
          }
          initialMinSeverity={
            ((prefsRes.data?.alerts_min_severity as number | undefined) ?? 2) as
              | 1
              | 2
              | 3
          }
        />
      ) : null}
    </div>
  );
}

async function ScanDoneBanner({ flagged }: { flagged: number }) {
  const t = await getTranslations("security");
  const safeCount = Number.isFinite(flagged) && flagged > 0 ? flagged : 0;
  return (
    <div className="ss-card flex items-start gap-3 border-teal/30 bg-teal-light p-4">
      <Check className="h-4 w-4 mt-0.5 text-teal" aria-hidden />
      <p className="text-body text-teal font-medium">
        {safeCount === 0
          ? t("scanDoneNone")
          : t("scanDoneN", { count: safeCount })}
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------------- */
/* Alerts tab                                                                 */
/* ------------------------------------------------------------------------- */

async function AlertsTab({
  userId,
  filter,
}: {
  userId: string;
  filter: AlertFilter;
}) {
  const t = await getTranslations("security.alerts");
  const tFilter = await getTranslations("security.alerts.filter");
  const tScan = await getTranslations("security");
  const supabase = createSupabaseServerClient();

  let query = supabase
    .from("threat_alerts")
    .select(
      "id, alert_type, severity, payload, created_at, dismissed, comment_id"
    )
    .eq("user_id", userId)
    .neq("alert_type", "raid")
    .order("severity", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(100);

  if (filter === "active") query = query.eq("dismissed", false);
  if (filter === "dismissed") query = query.eq("dismissed", true);

  const { data: alerts } = await query;

  const commentIds = (alerts ?? [])
    .map((a) => a.comment_id)
    .filter((id): id is string => typeof id === "string");

  type CommentMeta = {
    id: string;
    channel_id: string;
    text: string;
    author_name: string | null;
    author_avatar: string | null;
    video_id: string | null;
    video_title: string | null;
    platform_author_id: string | null;
  };
  const commentsById = new Map<string, CommentMeta>();
  const stalkerByKey = new Map<string, { id: string; blocked: boolean }>();

  if (commentIds.length > 0) {
    const { data: comments } = await supabase
      .from("comments")
      .select(
        "id, channel_id, text, author_name, author_avatar, video_id, video_title, platform_author_id"
      )
      .in("id", commentIds);
    for (const c of (comments ?? []) as CommentMeta[]) {
      commentsById.set(c.id, c);
    }

    const authorPairs = Array.from(commentsById.values())
      .filter((c) => c.platform_author_id)
      .map((c) => ({
        channel_id: c.channel_id,
        author_id: c.platform_author_id as string,
      }));

    if (authorPairs.length > 0) {
      const { data: stalkers } = await supabase
        .from("stalker_profiles")
        .select("id, channel_id, platform_author_id, blocked")
        .in(
          "channel_id",
          Array.from(new Set(authorPairs.map((p) => p.channel_id)))
        )
        .in(
          "platform_author_id",
          Array.from(new Set(authorPairs.map((p) => p.author_id)))
        );
      for (const s of stalkers ?? []) {
        stalkerByKey.set(`${s.channel_id}:${s.platform_author_id}`, {
          id: s.id,
          blocked: !!s.blocked,
        });
      }
    }
  }

  const rows: AlertRow[] = (alerts ?? []).map((a) => {
    const meta = a.comment_id ? commentsById.get(a.comment_id) ?? null : null;
    const stalker =
      meta?.platform_author_id != null
        ? stalkerByKey.get(`${meta.channel_id}:${meta.platform_author_id}`) ??
          null
        : null;
    return {
      id: a.id,
      alert_type: a.alert_type as AlertRow["alert_type"],
      severity: a.severity,
      payload: a.payload,
      created_at: a.created_at,
      comment: meta
        ? {
            id: meta.id,
            text: meta.text,
            author_name: meta.author_name,
            author_avatar: meta.author_avatar,
            video_id: meta.video_id,
            video_title: meta.video_title,
            platform_author_id: meta.platform_author_id,
          }
        : null,
      stalker,
    };
  });

  const filterPills: AlertFilter[] = ["active", "dismissed", "all"];

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav className="flex flex-wrap gap-1" aria-label="Alert filter">
          {filterPills.map((f) => (
            <a
              key={f}
              href={`/security?tab=alerts&filter=${f}`}
              className={
                filter === f
                  ? "ss-pill bg-primary text-white"
                  : "ss-pill bg-card text-muted border border-border hover:bg-surface"
              }
            >
              {tFilter(f)}
            </a>
          ))}
        </nav>
        <form action="/api/ai/threat-scan" method="post">
          <input
            type="hidden"
            name="redirectTo"
            value={`/security?tab=alerts&filter=${filter}`}
          />
          <button
            type="submit"
            className="ss-button-ghost h-9 px-3 text-caption"
          >
            <Sparkles className="h-3.5 w-3.5" aria-hidden />
            {tScan("scan")}
          </button>
        </form>
      </div>

      {rows.length === 0 ? (
        <div className="ss-card p-8 text-center">
          <p className="text-body font-medium">{t("empty")}</p>
          <p className="text-caption text-muted mt-1">{t("emptyHint")}</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((alert) => (
            <li key={alert.id}>
              <AlertCard
                alert={alert}
                redirectTo={`/security?tab=alerts&filter=${filter}`}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------------- */
/* Stalkers tab                                                               */
/* ------------------------------------------------------------------------- */

async function StalkersTab({ channelIds }: { channelIds: string[] }) {
  const t = await getTranslations("security.stalkers");
  const supabase = createSupabaseServerClient();

  const stalkers = channelIds.length
    ? (
        await supabase
          .from("stalker_profiles")
          .select(
            "id, platform_author_id, author_name, author_avatar, comment_count, negative_count, threat_count, risk_score, first_seen, last_seen, blocked"
          )
          .in("channel_id", channelIds)
          .gte("risk_score", 0.05)
          .order("risk_score", { ascending: false })
          .limit(100)
      ).data ?? []
    : [];

  const rows = stalkers as StalkerRowData[];

  return (
    <section className="flex flex-col gap-4">
      <p className="text-caption text-muted">{t("subtitle")}</p>
      {rows.length === 0 ? (
        <div className="ss-card p-8 text-center">
          <p className="text-body font-medium">{t("empty")}</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((s) => (
            <li key={s.id}>
              <StalkerRow stalker={s} redirectTo="/security?tab=stalkers" />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------------- */
/* Raids tab                                                                  */
/* ------------------------------------------------------------------------- */

async function RaidsTab({ userId }: { userId: string }) {
  const t = await getTranslations("security.raids");
  const supabase = createSupabaseServerClient();

  const { data: raids } = await supabase
    .from("threat_alerts")
    .select("id, severity, payload, created_at, dismissed, channel_id")
    .eq("user_id", userId)
    .eq("alert_type", "raid")
    .order("created_at", { ascending: false })
    .limit(50);

  return (
    <section className="flex flex-col gap-4">
      <p className="text-caption text-muted">{t("subtitle")}</p>
      {(!raids || raids.length === 0) ? (
        <div className="ss-card p-8 text-center">
          <p className="text-body font-medium">{t("empty")}</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {raids.map((r) => {
            const payload = (r.payload ?? {}) as {
              total?: number;
              toxic?: number;
              ratio?: number;
            };
            const total = payload.total ?? 0;
            const toxic = payload.toxic ?? 0;
            const ratio = Math.round((payload.ratio ?? 0) * 100);
            return (
              <li key={r.id}>
                <article className="ss-card p-5 flex flex-col gap-3">
                  <header className="flex flex-wrap items-center gap-2">
                    <span className="ss-pill bg-amber-light text-amber">
                      <ZapIcon className="h-3 w-3" aria-hidden />
                      {t("window")}
                    </span>
                    <span className="text-caption text-muted">
                      {relativeTimeFr(r.created_at)}
                    </span>
                    {r.dismissed ? (
                      <span className="ss-pill bg-card text-muted border border-border">
                        <ShieldAlert className="h-3 w-3" aria-hidden />
                        archivé
                      </span>
                    ) : null}
                  </header>
                  <p className="text-body">
                    {t("summary", { toxic, total, ratio })}
                  </p>
                  {!r.dismissed ? (
                    <form
                      action="/api/threats/dismiss"
                      method="post"
                      className="self-end"
                    >
                      <input type="hidden" name="alertId" value={r.id} />
                      <input
                        type="hidden"
                        name="redirectTo"
                        value="/security?tab=raids"
                      />
                      <button
                        type="submit"
                        className="ss-button-ghost h-9 px-3 text-caption"
                      >
                        archiver
                      </button>
                    </form>
                  ) : null}
                </article>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
