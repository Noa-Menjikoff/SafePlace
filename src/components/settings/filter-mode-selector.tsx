"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Feather, Shield, Mountain } from "lucide-react";
import { cn } from "@/lib/utils";
import { FILTER_MODE_META, type FilterMode } from "@/lib/filter-mode";

const ICONS: Record<FilterMode, typeof Feather> = {
  sensitive: Feather,
  standard: Shield,
  tough: Mountain,
};

export function FilterModeSelector({ initial }: { initial: FilterMode }) {
  const router = useRouter();
  const [value, setValue] = useState<FilterMode>(initial);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function pick(next: FilterMode) {
    if (next === value || pending) return;
    setValue(next);
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/profile/update", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ filter_mode: next }),
        });
        if (!res.ok) throw new Error("HTTP " + res.status);
        router.refresh();
      } catch (e) {
        console.error(e);
        setError("Échec de l'enregistrement.");
        setValue(initial);
      }
    });
  }

  return (
    <div role="radiogroup" className="grid gap-3 sm:grid-cols-3">
      {(Object.keys(FILTER_MODE_META) as FilterMode[]).map((m) => {
        const meta = FILTER_MODE_META[m];
        const Icon = ICONS[m];
        const active = m === value;
        return (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={pending}
            onClick={() => pick(m)}
            className={cn(
              "relative text-left rounded-md border p-4 flex flex-col gap-2 transition-colors duration-200",
              active
                ? "border-primary bg-primary-light"
                : "border-border bg-card hover:bg-bg/40",
              pending && "opacity-70 cursor-wait"
            )}
          >
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "grid place-items-center h-7 w-7 rounded-md",
                  active
                    ? "bg-primary text-white"
                    : "bg-bg/50 text-muted"
                )}
              >
                <Icon className="h-3.5 w-3.5" aria-hidden />
              </span>
              <span className="text-body font-medium">{meta.label}</span>
              {active ? (
                <Check className="h-4 w-4 ml-auto text-primary" aria-hidden />
              ) : null}
            </div>
            <p className="text-caption text-muted leading-relaxed">
              {meta.description}
            </p>
          </button>
        );
      })}
      {error ? (
        <p className="sm:col-span-3 text-caption text-amber">{error}</p>
      ) : null}
    </div>
  );
}
