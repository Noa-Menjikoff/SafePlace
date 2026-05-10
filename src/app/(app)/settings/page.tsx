import Image from "next/image";
import {
  Check,
  AlertCircle,
  Plug,
  Plus,
  Lock,
  RefreshCw,
} from "lucide-react";
import { getTranslations } from "next-intl/server";
import { getAppContext } from "@/lib/auth-context";
import { relativeTimeFr } from "@/lib/format";
import { FilterModeSelector } from "@/components/settings/filter-mode-selector";
import { MetricShieldToggle } from "@/components/settings/metric-shield-toggle";
import { LanguageSelector } from "@/components/settings/language-selector";
import { ThemeToggle } from "@/components/settings/theme-toggle";
import { SubscriptionCard } from "@/components/settings/subscription-card";

export const dynamic = "force-dynamic";

const REASON_KEYS = [
  "state_mismatch",
  "token_exchange",
  "channel_fetch",
  "no_channel",
  "db",
  "missing_params",
  "access_denied",
] as const;

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: {
    yt?: string;
    reason?: string;
    upgrade?: string;
    sync?: string;
    count?: string;
    classified?: string;
    stripe?: string;
  };
}) {
  const ctx = await getAppContext();
  const t = await getTranslations("settings");
  const tBanners = await getTranslations("settings.banners");
  const tConnections = await getTranslations("settings.connections");
  const tReasons = await getTranslations("settings.banners.ytReasons");

  const youtubeChannels = ctx.channels.filter((c) => c.platform === "youtube");
  const plan = ctx.plan;
  const channelLimit = plan === "pro" ? 3 : 1;
  const canAddChannel = youtubeChannels.length < channelLimit;
  const planLabel = plan === "pro" ? tConnections("planPro") : tConnections("planFree");
  const showRecoveryBanner = plan === "free" && !!ctx.stripeCustomerId;
  const reason = searchParams.reason as (typeof REASON_KEYS)[number] | undefined;
  const reasonText =
    reason && (REASON_KEYS as readonly string[]).includes(reason)
      ? tReasons(reason)
      : tReasons("default");

  return (
    <div className="mx-auto max-w-3xl flex flex-col gap-8">
      <div>
        <h1 className="text-h1">{t("title")}</h1>
        <p className="text-muted text-body mt-1">{t("subtitle")}</p>
      </div>

      {searchParams.yt === "connected" ? (
        <div className="ss-card flex items-start gap-3 border-teal/30 bg-teal-light p-4">
          <Check className="h-4 w-4 mt-0.5 text-teal" aria-hidden />
          <div>
            <p className="text-body font-medium text-teal">
              {tBanners("ytConnected")}
            </p>
            <p className="text-caption text-muted">
              {tBanners("ytConnectedDesc")}
            </p>
          </div>
        </div>
      ) : null}

      {searchParams.yt === "error" ? (
        <div className="ss-card flex items-start gap-3 border-amber/30 bg-amber-light p-4">
          <AlertCircle className="h-4 w-4 mt-0.5 text-amber" aria-hidden />
          <div>
            <p className="text-body font-medium text-amber">
              {tBanners("ytErrorTitle")}
            </p>
            <p className="text-caption text-muted">{reasonText}</p>
          </div>
        </div>
      ) : null}

      {searchParams.yt === "disconnected" ? (
        <div className="ss-card flex items-start gap-3 border-border p-4">
          <Plug className="h-4 w-4 mt-0.5 text-muted" aria-hidden />
          <div>
            <p className="text-body font-medium">
              {tBanners("ytDisconnectedTitle")}
            </p>
            <p className="text-caption text-muted">
              {tBanners("ytDisconnectedDesc")}
            </p>
          </div>
        </div>
      ) : null}

      {searchParams.sync === "done" ? (
        <div className="ss-card flex items-start gap-3 border-teal/30 bg-teal-light p-4">
          <Check className="h-4 w-4 mt-0.5 text-teal" aria-hidden />
          <div>
            <p className="text-body font-medium text-teal">
              {tBanners("syncDoneTitle")}
            </p>
            <p className="text-caption text-muted">
              {tBanners("syncDoneDesc", {
                count: searchParams.count ?? "0",
                plural: Number(searchParams.count ?? 0) > 1 ? "s" : "",
                classified: searchParams.classified ?? "0",
                cplural: Number(searchParams.classified ?? 0) > 1 ? "s" : "",
              })}
            </p>
          </div>
        </div>
      ) : null}

      {searchParams.sync === "error" ? (
        <div className="ss-card flex items-start gap-3 border-amber/30 bg-amber-light p-4">
          <AlertCircle className="h-4 w-4 mt-0.5 text-amber" aria-hidden />
          <div>
            <p className="text-body font-medium text-amber">
              {tBanners("syncErrorTitle")}
            </p>
            <p className="text-caption text-muted">
              {tBanners("syncErrorDesc")}
            </p>
          </div>
        </div>
      ) : null}

      {searchParams.stripe === "success" ? (
        <div className="ss-card flex items-start gap-3 border-teal/30 bg-teal-light p-4">
          <Check className="h-4 w-4 mt-0.5 text-teal" aria-hidden />
          <div>
            <p className="text-body font-medium text-teal">
              {tBanners("stripeSuccessTitle")}
            </p>
            <p className="text-caption text-muted">
              {tBanners("stripeSuccessDesc")}
            </p>
          </div>
        </div>
      ) : null}

      {searchParams.stripe === "cancel" ? (
        <div className="ss-card flex items-start gap-3 border-border p-4">
          <AlertCircle className="h-4 w-4 mt-0.5 text-muted" aria-hidden />
          <div>
            <p className="text-body font-medium">
              {tBanners("stripeCancelTitle")}
            </p>
            <p className="text-caption text-muted">
              {tBanners("stripeCancelDesc")}
            </p>
          </div>
        </div>
      ) : null}

      {searchParams.stripe === "error" ? (
        <div className="ss-card flex items-start gap-3 border-amber/30 bg-amber-light p-4">
          <AlertCircle className="h-4 w-4 mt-0.5 text-amber" aria-hidden />
          <div>
            <p className="text-body font-medium text-amber">
              {tBanners("stripeErrorTitle")}
            </p>
            <p className="text-caption text-muted">
              {tBanners("stripeErrorDesc")}
            </p>
          </div>
        </div>
      ) : null}

      {searchParams.stripe === "missing_config" ? (
        <div className="ss-card flex items-start gap-3 border-amber/30 bg-amber-light p-4">
          <AlertCircle className="h-4 w-4 mt-0.5 text-amber" aria-hidden />
          <div>
            <p className="text-body font-medium text-amber">
              {tBanners("stripeMissingTitle")}
            </p>
          </div>
        </div>
      ) : null}

      {searchParams.stripe === "no_customer" ? (
        <div className="ss-card flex items-start gap-3 border-border p-4">
          <AlertCircle className="h-4 w-4 mt-0.5 text-muted" aria-hidden />
          <div>
            <p className="text-body font-medium">
              {tBanners("stripeNoCustomerTitle")}
            </p>
            <p className="text-caption text-muted">
              {tBanners("stripeNoCustomerDesc")}
            </p>
          </div>
        </div>
      ) : null}

      {searchParams.stripe === "synced_pro" ? (
        <div className="ss-card flex items-start gap-3 border-teal/30 bg-teal-light p-4">
          <Check className="h-4 w-4 mt-0.5 text-teal" aria-hidden />
          <div>
            <p className="text-body font-medium text-teal">
              {tBanners("stripeSyncedProTitle")}
            </p>
            <p className="text-caption text-muted">
              {tBanners("stripeSyncedProDesc")}
            </p>
          </div>
        </div>
      ) : null}

      {searchParams.stripe === "synced_free" ? (
        <div className="ss-card flex items-start gap-3 border-border p-4">
          <Check className="h-4 w-4 mt-0.5 text-muted" aria-hidden />
          <div>
            <p className="text-body font-medium">
              {tBanners("stripeSyncedFreeTitle")}
            </p>
            <p className="text-caption text-muted">
              {tBanners("stripeSyncedFreeDesc")}
            </p>
          </div>
        </div>
      ) : null}

      {showRecoveryBanner ? (
        <div className="ss-card flex items-start gap-3 border-amber/30 bg-amber-light/60 p-4">
          <AlertCircle className="h-4 w-4 mt-0.5 text-amber" aria-hidden />
          <div className="flex-1 min-w-0">
            <p className="text-body font-medium text-amber">
              {tBanners("recoveryTitle")}
            </p>
            <p className="text-caption text-muted">
              {tBanners("recoveryDesc")}
            </p>
          </div>
          <form action="/api/stripe/refresh-plan" method="post">
            <button
              type="submit"
              className="ss-button-primary h-9 px-3 text-caption"
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden />
              {tBanners("recoveryCta")}
            </button>
          </form>
        </div>
      ) : null}

      {/* 1. Connexions */}
      <section className="ss-card p-6">
        <header className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-h2">{tConnections("title")}</h2>
            <p className="text-caption text-muted mt-0.5">
              {tConnections("planLabel", {
                plan: planLabel,
                used: youtubeChannels.length,
                limit: channelLimit,
                plural: channelLimit > 1 ? "s" : "",
              })}
            </p>
          </div>
        </header>

        <div className="mt-5 flex flex-col gap-3">
          {youtubeChannels.length === 0 ? (
            <div className="rounded-md border border-dashed border-border p-5 text-center">
              <p className="text-body font-medium">
                {tConnections("noChannelTitle")}
              </p>
              <p className="text-caption text-muted mt-1">
                {tConnections("noChannelDesc")}
              </p>
              <a
                href="/api/youtube/connect"
                className="ss-button-primary mt-4 inline-flex"
              >
                <Plus className="h-4 w-4" aria-hidden />
                {tConnections("connectCta")}
              </a>
            </div>
          ) : (
            <>
              {youtubeChannels.map((c) => (
                <div
                  key={c.id}
                  className="flex flex-col gap-3 rounded-md border border-border bg-bg/40 p-4 sm:flex-row sm:items-center"
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    {c.thumbnail_url ? (
                      <Image
                        src={c.thumbnail_url}
                        alt=""
                        width={40}
                        height={40}
                        className="h-10 w-10 rounded-full"
                        unoptimized
                      />
                    ) : (
                      <div className="h-10 w-10 rounded-full bg-primary-light" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-body font-medium truncate">{c.name}</p>
                      <p className="text-caption text-muted">
                        YouTube ·{" "}
                        {tConnections("subscribers", {
                          count: (c.subscriber_count ?? 0).toLocaleString(
                            "fr-FR"
                          ),
                        })}{" "}
                        ·{" "}
                        {tConnections("syncRelative", {
                          time: relativeTimeFr(c.last_synced_at),
                        })}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <form action="/api/youtube/sync" method="post">
                      <input type="hidden" name="channelId" value={c.id} />
                      <input type="hidden" name="redirect" value="1" />
                      <button
                        type="submit"
                        className="ss-button-ghost h-9 px-3 text-caption"
                      >
                        <RefreshCw className="h-3.5 w-3.5" aria-hidden />
                        {tConnections("sync")}
                      </button>
                    </form>
                    <form action="/api/youtube/disconnect" method="post">
                      <input type="hidden" name="channelId" value={c.id} />
                      <button
                        type="submit"
                        className="ss-button-ghost h-9 px-3 text-caption"
                      >
                        {tConnections("disconnect")}
                      </button>
                    </form>
                  </div>
                </div>
              ))}

              {canAddChannel ? (
                <a
                  href="/api/youtube/connect"
                  className="ss-button-ghost justify-center"
                >
                  <Plus className="h-4 w-4" aria-hidden />
                  {tConnections("connectAnother")}
                </a>
              ) : (
                <p className="text-caption text-muted text-center">
                  {tConnections("limitReached", { plan: planLabel })}
                  {plan !== "pro" ? tConnections("upgradeForMore") : ""}
                </p>
              )}
            </>
          )}

          <div className="flex items-center gap-3 rounded-md border border-dashed border-border bg-bg/40 p-4">
            <div className="h-10 w-10 rounded-full bg-primary-light grid place-items-center">
              <Lock className="h-4 w-4 text-primary" aria-hidden />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-body font-medium">
                {tConnections("instagramSoon")}
              </p>
              <p className="text-caption text-muted">
                {tConnections("instagramHint")}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 2. Niveau de filtrage */}
      <section className="ss-card p-6">
        <header>
          <h2 className="text-h2">{t("filterMode.title")}</h2>
          <p className="text-caption text-muted mt-0.5">
            {t("filterMode.subtitle")}
          </p>
        </header>
        <div className="mt-5">
          <FilterModeSelector initial={ctx.filterMode} />
        </div>
      </section>

      {/* 3. Affichage */}
      <section className="ss-card p-6">
        <header>
          <h2 className="text-h2">{t("display.title")}</h2>
          <p className="text-caption text-muted mt-0.5">
            {t("display.subtitle")}
          </p>
        </header>
        <div className="mt-5 flex flex-col gap-5">
          <MetricShieldToggle initial={ctx.metricShield} />
          <div>
            <p className="text-body font-medium mb-2">{t("display.theme")}</p>
            <ThemeToggle />
          </div>
          <div>
            <p className="text-body font-medium mb-2">{t("display.language")}</p>
            <LanguageSelector initial={ctx.language} />
          </div>
        </div>
      </section>

      {/* 4. Re-classifier */}
      {youtubeChannels.length > 0 ? (
        <section className="ss-card p-6">
          <h2 className="text-h2">{t("reclassify.title")}</h2>
          <p className="text-caption text-muted mt-1">{t("reclassify.desc")}</p>
          <form action="/api/ai/classify" method="post" className="mt-4">
            <input type="hidden" name="force" value="1" />
            <input type="hidden" name="redirect" value="1" />
            <button type="submit" className="ss-button-ghost">
              <RefreshCw className="h-4 w-4" aria-hidden />
              {t("reclassify.cta")}
            </button>
          </form>
        </section>
      ) : null}

      {/* 5. Abonnement */}
      <SubscriptionCard plan={plan} />
    </div>
  );
}
