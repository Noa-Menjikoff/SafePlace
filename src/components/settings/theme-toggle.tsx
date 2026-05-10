"use client";

import { useState, useEffect } from "react";
import { Sun, Moon, Monitor } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { THEMES, type Theme, THEME_COOKIE } from "@/lib/theme";

const ICONS: Record<Theme, typeof Sun> = {
  light: Sun,
  dark: Moon,
  system: Monitor,
};

function getCookieTheme(): Theme {
  if (typeof document === "undefined") return "system";
  const match = document.cookie.match(
    new RegExp("(^|; )" + THEME_COOKIE + "=([^;]*)")
  );
  const value = match ? decodeURIComponent(match[2]) : null;
  if (value === "light" || value === "dark" || value === "system") return value;
  return "system";
}

function applyTheme(theme: Theme) {
  const resolved =
    theme === "system"
      ? window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light"
      : theme;
  document.documentElement.setAttribute("data-theme", resolved);
}

function setCookieTheme(theme: Theme) {
  const oneYear = 60 * 60 * 24 * 365;
  document.cookie = `${THEME_COOKIE}=${theme}; path=/; max-age=${oneYear}; samesite=lax`;
}

export function ThemeToggle() {
  const t = useTranslations("settings.theme");
  const [theme, setTheme] = useState<Theme>("system");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setTheme(getCookieTheme());
    setHydrated(true);
  }, []);

  // Suivre le system pref si on est en mode "system"
  useEffect(() => {
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => applyTheme("system");
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [theme]);

  function pick(next: Theme) {
    setTheme(next);
    setCookieTheme(next);
    applyTheme(next);
  }

  return (
    <div
      role="radiogroup"
      className="inline-flex items-center gap-1 p-1 rounded-md border border-border bg-card w-fit"
    >
      {THEMES.map((value) => {
        const Icon = ICONS[value];
        const active = hydrated && value === theme;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => pick(value)}
            className={cn(
              "inline-flex items-center gap-2 rounded-md px-3 h-9 text-caption font-medium transition-colors duration-200",
              active
                ? "bg-primary-light text-primary"
                : "text-muted hover:text-ink hover:bg-bg/50"
            )}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden />
            <span>{t(value)}</span>
          </button>
        );
      })}
    </div>
  );
}
