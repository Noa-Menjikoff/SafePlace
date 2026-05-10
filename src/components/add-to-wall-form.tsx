"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Plus, X } from "lucide-react";

export function AddToWallForm() {
  const t = useTranslations("wall");
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [author, setAuthor] = useState("");

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="ss-button-ghost"
      >
        <Plus className="h-4 w-4" aria-hidden />
        {t("addManually")}
      </button>
    );
  }

  return (
    <form
      action="/api/comments/save-to-wall"
      method="post"
      className="ss-card p-5 flex flex-col gap-3"
      onSubmit={() => {
        // After submit, server redirects — clear local state defensively.
        setTimeout(() => {
          setText("");
          setAuthor("");
          setOpen(false);
        }, 50);
      }}
    >
      <input type="hidden" name="redirectTo" value="/wall" />

      <div className="flex items-center justify-between">
        <h3 className="text-body font-medium">{t("newEntry")}</h3>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-muted hover:text-ink"
          aria-label="Close"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>

      <textarea
        name="customText"
        required
        autoFocus
        rows={4}
        maxLength={2000}
        placeholder={t("placeholder")}
        value={text}
        onChange={(e) => setText(e.target.value)}
        className="w-full rounded-md border border-border bg-card p-3 text-body font-serif text-[16px] leading-relaxed focus:outline-none focus:ring-2 focus:ring-primary-mid"
      />

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          name="authorName"
          type="text"
          maxLength={100}
          placeholder={t("fromPlaceholder")}
          value={author}
          onChange={(e) => setAuthor(e.target.value)}
          className="flex-1 rounded-md border border-border bg-card px-3 h-10 text-body focus:outline-none focus:ring-2 focus:ring-primary-mid"
        />
        <button
          type="submit"
          disabled={!text.trim()}
          className="ss-button-primary h-10 disabled:opacity-50"
        >
          {t("addCta")}
        </button>
      </div>
    </form>
  );
}
