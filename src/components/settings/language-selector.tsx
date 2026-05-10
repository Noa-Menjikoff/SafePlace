"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

type Language = "fr" | "en";

const LANGUAGES: { value: Language; label: string; flag: string }[] = [
  { value: "fr", label: "Français", flag: "🇫🇷" },
  { value: "en", label: "English", flag: "🇬🇧" },
];

export function LanguageSelector({ initial }: { initial: Language }) {
  const router = useRouter();
  const [value, setValue] = useState<Language>(initial);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function pick(next: Language) {
    if (next === value || pending) return;
    setValue(next);
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/profile/update", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ language: next }),
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
    <div className="flex flex-col gap-2">
      <div
        role="radiogroup"
        className="inline-flex items-center gap-1 p-1 rounded-md border border-border bg-card w-fit"
      >
        {LANGUAGES.map((lang) => {
          const active = lang.value === value;
          return (
            <button
              key={lang.value}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={pending}
              onClick={() => pick(lang.value)}
              className={cn(
                "inline-flex items-center gap-2 rounded-md px-3 h-9 text-caption font-medium transition-colors duration-200",
                active
                  ? "bg-primary-light text-primary"
                  : "text-muted hover:text-ink hover:bg-bg/50",
                pending && "cursor-wait"
              )}
            >
              <span aria-hidden>{lang.flag}</span>
              <span>{lang.label}</span>
            </button>
          );
        })}
      </div>
      <p className="text-caption text-muted">
        L&apos;IA répondra dans cette langue (TL;DR, brouillons de réponse).
      </p>
      {error ? <p className="text-caption text-amber">{error}</p> : null}
    </div>
  );
}
