"use client";

import { useState, type ReactNode } from "react";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";

type MetricCardProps = {
  label: string;
  value: number | null;
  suffix?: string;
  icon?: ReactNode;
  hint?: string;
  variant?: "primary" | "teal" | "amber" | "blue";
  /** True = always show the value. */
  alwaysVisible?: boolean;
  /** Default visibility when not always visible. */
  defaultVisible?: boolean;
  /** Global metric shield from settings — overrides defaults to hide. */
  shielded?: boolean;
};

const VARIANT: Record<NonNullable<MetricCardProps["variant"]>, string> = {
  primary: "text-primary",
  teal: "text-teal",
  amber: "text-amber",
  blue: "text-blue",
};

export function MetricCard({
  label,
  value,
  suffix,
  icon,
  hint,
  variant = "primary",
  alwaysVisible = false,
  defaultVisible = true,
  shielded = false,
}: MetricCardProps) {
  const initiallyHidden = shielded ? true : !defaultVisible;
  const [hidden, setHidden] = useState(initiallyHidden);
  const showToggle = !alwaysVisible;
  const reveal = !hidden;
  const formatted =
    value == null ? "—" : value.toLocaleString("fr-FR") + (suffix ?? "");

  return (
    <div className="ss-card p-5 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-caption text-muted">
          {icon}
          {label}
        </span>
        {showToggle ? (
          <button
            type="button"
            onClick={() => setHidden((h) => !h)}
            className="text-muted hover:text-ink p-1 -mr-1 rounded transition-colors duration-200"
            aria-label={reveal ? "Masquer" : "Afficher"}
            title={reveal ? "Masquer" : "Afficher"}
          >
            {reveal ? (
              <Eye className="h-3.5 w-3.5" aria-hidden />
            ) : (
              <EyeOff className="h-3.5 w-3.5" aria-hidden />
            )}
          </button>
        ) : null}
      </div>

      <div className={cn("text-h1 tabular-nums font-medium", VARIANT[variant])}>
        {reveal ? formatted : <span className="text-muted">•••</span>}
      </div>

      {hint ? (
        <p className="text-caption text-muted">{hint}</p>
      ) : null}
    </div>
  );
}
