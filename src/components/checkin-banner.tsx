"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Heart } from "lucide-react";

const MOODS = [
  { value: "exhausted", emoji: "😶" },
  { value: "tired", emoji: "😕" },
  { value: "neutral", emoji: "😐" },
  { value: "good", emoji: "🙂" },
  { value: "great", emoji: "😄" },
] as const;

type Mood = (typeof MOODS)[number]["value"];

type CheckInBannerProps = {
  todaysMood: Mood | null;
};

export function CheckInBanner({ todaysMood }: CheckInBannerProps) {
  const t = useTranslations("checkin");
  const [submitting, setSubmitting] = useState<string | null>(null);

  if (todaysMood) {
    const m = MOODS.find((x) => x.value === todaysMood);
    return (
      <section className="ss-card flex items-center gap-3 p-4">
        <Heart className="h-4 w-4 text-primary" aria-hidden />
        <p className="text-body">
          {t("doneFelt", {
            mood: t(`moods.${todaysMood}`).toLowerCase(),
            emoji: m?.emoji ?? "",
          })}
        </p>
      </section>
    );
  }

  return (
    <section className="ss-card p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-body font-medium">{t("question")}</h2>
          <p className="text-caption text-muted mt-0.5">{t("subtitle")}</p>
        </div>
        <form
          action="/api/checkin"
          method="post"
          className="flex flex-wrap gap-2"
          onSubmit={(e) => {
            const submitter = (e.nativeEvent as SubmitEvent)
              .submitter as HTMLButtonElement | null;
            if (submitter?.value) setSubmitting(submitter.value);
          }}
        >
          {MOODS.map((m) => {
            const label = t(`moods.${m.value}`);
            return (
              <button
                key={m.value}
                type="submit"
                name="mood"
                value={m.value}
                disabled={submitting !== null}
                className="ss-button-ghost h-9 px-3 text-caption disabled:opacity-50"
                title={label}
              >
                <span aria-hidden>{m.emoji}</span>
                <span className="hidden sm:inline">{label}</span>
              </button>
            );
          })}
        </form>
      </div>
    </section>
  );
}
