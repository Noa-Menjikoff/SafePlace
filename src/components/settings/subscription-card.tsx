import { Sparkles, Check, Shield } from "lucide-react";
import { getTranslations } from "next-intl/server";
import type { Plan } from "@/lib/plans";

const FREE_FEATURE_KEYS = ["channels", "tldr", "cleanWall", "limit"] as const;
const PRO_FEATURE_KEYS = ["channels", "tldr", "replyStats", "shield"] as const;
const SHIELD_FEATURE_KEYS = [
  "threatDetection",
  "stalkers",
  "raids",
  "emailAlerts",
] as const;

export async function SubscriptionCard({ plan }: { plan: Plan }) {
  const t = await getTranslations("settings.subscription");
  const isPro = plan === "pro";
  const isShield = plan === "shield";
  const isPaying = isPro || isShield;

  return (
    <div className="flex flex-col gap-4">
      {/* Plan courant */}
      <section className="ss-card p-6 flex flex-col gap-4">
        <header className="flex items-start justify-between gap-3">
          <div>
            <span
              className={
                isShield
                  ? "ss-pill bg-amber-light text-amber inline-flex"
                  : "ss-pill-primary inline-flex"
              }
            >
              {isShield ? (
                <Shield className="h-3.5 w-3.5" aria-hidden />
              ) : (
                <Sparkles className="h-3.5 w-3.5" aria-hidden />
              )}
              {isShield
                ? t("badgeShield")
                : isPro
                  ? t("badgePro")
                  : t("badgeFree")}
            </span>
            <h2 className="text-h2 mt-3">
              {isShield
                ? t("titleShield")
                : isPro
                  ? t("titlePro")
                  : t("titleFree")}
            </h2>
            <p className="text-caption text-muted mt-0.5">
              {isShield
                ? t("priceShield")
                : isPro
                  ? t("pricePro")
                  : t("priceFree")}
            </p>
          </div>
          {isPaying ? (
            <form action="/api/stripe/portal" method="post">
              <button
                type="submit"
                className="ss-button-ghost h-9 px-3 text-caption"
              >
                {t("managePortal")}
              </button>
            </form>
          ) : (
            <form action="/api/stripe/checkout" method="post">
              <input type="hidden" name="plan" value="pro" />
              <button
                type="submit"
                className="ss-button-primary h-9 px-3 text-caption"
              >
                {t("upgradeCta")}
              </button>
            </form>
          )}
        </header>

        <ul className="grid gap-2 sm:grid-cols-2">
          {(isShield
            ? SHIELD_FEATURE_KEYS
            : isPro
              ? PRO_FEATURE_KEYS
              : FREE_FEATURE_KEYS
          ).map((key) => (
            <li
              key={key}
              className="flex items-center gap-2 text-caption text-muted"
            >
              <Check
                className={`h-3.5 w-3.5 ${
                  isShield
                    ? "text-amber"
                    : isPro
                      ? "text-teal"
                      : "text-primary"
                }`}
                aria-hidden
              />
              <span>
                {t(
                  `${isShield ? "shieldFeatures" : isPro ? "proFeatures" : "freeFeatures"}.${key}`
                )}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {/* Tier d'upsell : si free → Pro encart, si pro → Shield encart */}
      {!isPaying ? (
        <ShieldUpsellCard />
      ) : isPro ? (
        <ShieldUpsellCard />
      ) : null}
    </div>
  );
}

async function ShieldUpsellCard() {
  const t = await getTranslations("settings.subscription");
  return (
    <section className="ss-card p-6 flex flex-col gap-4 border-amber/30">
      <header className="flex items-start justify-between gap-3">
        <div>
          <span className="ss-pill bg-amber-light text-amber inline-flex">
            <Shield className="h-3.5 w-3.5" aria-hidden />
            {t("badgeShield")}
          </span>
          <h2 className="text-h2 mt-3">{t("titleShield")}</h2>
          <p className="text-caption text-muted mt-0.5">{t("priceShield")}</p>
        </div>
        <form action="/api/stripe/checkout" method="post">
          <input type="hidden" name="plan" value="shield" />
          <button
            type="submit"
            className="ss-button-primary h-9 px-3 text-caption"
          >
            {t("upgradeShieldCta")}
          </button>
        </form>
      </header>
      <ul className="grid gap-2 sm:grid-cols-2">
        {SHIELD_FEATURE_KEYS.map((key) => (
          <li
            key={key}
            className="flex items-center gap-2 text-caption text-muted"
          >
            <Check className="h-3.5 w-3.5 text-amber" aria-hidden />
            <span>{t(`shieldFeatures.${key}`)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
