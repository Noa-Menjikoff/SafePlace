"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

export function MetricShieldToggle({ initial }: { initial: boolean }) {
  const router = useRouter();
  const t = useTranslations("settings");
  const [enabled, setEnabled] = useState(initial);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function toggle() {
    if (pending) return;
    const next = !enabled;
    setEnabled(next);
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/profile/update", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ metric_shield: next }),
        });
        if (!res.ok) throw new Error("HTTP " + res.status);
        router.refresh();
      } catch (e) {
        console.error(e);
        setError(t("filterMode.saveError"));
        setEnabled(!next);
      }
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-start gap-3 rounded-md border border-border bg-card p-4">
        <span
          className={cn(
            "grid place-items-center h-9 w-9 rounded-md shrink-0",
            enabled ? "bg-primary text-white" : "bg-bg/60 text-muted"
          )}
        >
          <ShieldCheck className="h-4 w-4" aria-hidden />
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-body font-medium">{t("display.shieldTitle")}</p>
          <p className="text-caption text-muted mt-0.5">
            {t("display.shieldDesc")}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          onClick={toggle}
          disabled={pending}
          className={cn(
            "relative h-6 w-11 rounded-full transition-colors duration-200 shrink-0",
            enabled ? "bg-primary" : "bg-border",
            pending && "opacity-70 cursor-wait"
          )}
        >
          <span
            className={cn(
              "absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-200",
              enabled && "translate-x-5"
            )}
          />
        </button>
      </div>
      {error ? <p className="text-caption text-amber">{error}</p> : null}
    </div>
  );
}
