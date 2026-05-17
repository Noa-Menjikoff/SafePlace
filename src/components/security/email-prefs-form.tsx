"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Mail, BellOff, Calendar, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

type EmailMode = "immediate" | "digest_daily" | "digest_weekly" | "off";
type Severity = 1 | 2 | 3;

const MODES: { key: EmailMode; icon: typeof Mail }[] = [
  { key: "immediate", icon: Zap },
  { key: "digest_daily", icon: Mail },
  { key: "digest_weekly", icon: Calendar },
  { key: "off", icon: BellOff },
];

export function EmailPrefsForm({
  initialMode,
  initialMinSeverity,
}: {
  initialMode: EmailMode;
  initialMinSeverity: Severity;
}) {
  const router = useRouter();
  const t = useTranslations("security.prefs");
  const tSev = useTranslations("security.severity");
  const [mode, setMode] = useState<EmailMode>(initialMode);
  const [minSeverity, setMinSeverity] = useState<Severity>(initialMinSeverity);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  function update(patch: { mode?: EmailMode; minSeverity?: Severity }) {
    const nextMode = patch.mode ?? mode;
    const nextSeverity = patch.minSeverity ?? minSeverity;
    setMode(nextMode);
    setMinSeverity(nextSeverity);
    setError(null);

    startTransition(async () => {
      try {
        const res = await fetch("/api/threats/email-prefs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            alerts_email_mode: nextMode,
            alerts_min_severity: nextSeverity,
          }),
        });
        if (!res.ok) throw new Error("HTTP " + res.status);
        setSavedAt(Date.now());
        router.refresh();
      } catch (e) {
        console.error(e);
        setError(t("saveError"));
        // rollback
        if (patch.mode) setMode(initialMode);
        if (patch.minSeverity) setMinSeverity(initialMinSeverity);
      }
    });
  }

  return (
    <section className="ss-card p-6 flex flex-col gap-6">
      <header>
        <h2 className="text-h2">{t("emailMode")}</h2>
        <p className="text-caption text-muted mt-1">{t("subtitle")}</p>
      </header>

      <div className="grid gap-2 sm:grid-cols-2">
        {MODES.map((m) => {
          const Icon = m.icon;
          const active = mode === m.key;
          return (
            <button
              key={m.key}
              type="button"
              onClick={() => update({ mode: m.key })}
              disabled={pending}
              className={cn(
                "flex items-start gap-3 rounded-md border p-4 text-left transition-colors duration-200 ease-out-soft",
                active
                  ? "border-primary bg-primary-light"
                  : "border-border bg-card hover:bg-surface",
                pending && "cursor-wait opacity-70"
              )}
            >
              <span
                className={cn(
                  "grid place-items-center h-9 w-9 rounded-md shrink-0",
                  active ? "bg-primary text-white" : "bg-bg/60 text-muted"
                )}
              >
                <Icon className="h-4 w-4" aria-hidden />
              </span>
              <div className="flex-1 min-w-0">
                <p
                  className={cn(
                    "text-body font-medium",
                    active && "text-primary"
                  )}
                >
                  {t(`modes.${m.key}`)}
                </p>
                <p className="text-caption text-muted mt-0.5">
                  {t(`modes.${m.key}Desc`)}
                </p>
              </div>
            </button>
          );
        })}
      </div>

      <div>
        <h3 className="text-body font-medium">{t("minSeverity")}</h3>
        <p className="text-caption text-muted mt-1">{t("minSeverityHint")}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {[1, 2, 3].map((s) => {
            const active = minSeverity === s;
            return (
              <button
                key={s}
                type="button"
                onClick={() => update({ minSeverity: s as Severity })}
                disabled={pending}
                className={cn(
                  "ss-pill",
                  active
                    ? "bg-primary text-white"
                    : "bg-card text-muted border border-border hover:bg-surface",
                  pending && "cursor-wait opacity-70"
                )}
              >
                {tSev(String(s))}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex items-center gap-3 text-caption">
        {error ? (
          <span className="text-amber">{error}</span>
        ) : savedAt ? (
          <span className="text-teal">{t("saved")}</span>
        ) : null}
      </div>
    </section>
  );
}
