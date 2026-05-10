"use client";

import { useState } from "react";
import { Heart } from "lucide-react";

const MOODS = [
  { value: "exhausted", label: "Épuisé", emoji: "😶" },
  { value: "tired", label: "Fatigué", emoji: "😕" },
  { value: "neutral", label: "Neutre", emoji: "😐" },
  { value: "good", label: "Bien", emoji: "🙂" },
  { value: "great", label: "En forme", emoji: "😄" },
] as const;

type CheckInBannerProps = {
  todaysMood: (typeof MOODS)[number]["value"] | null;
};

export function CheckInBanner({ todaysMood }: CheckInBannerProps) {
  const [submitting, setSubmitting] = useState<string | null>(null);

  if (todaysMood) {
    const m = MOODS.find((x) => x.value === todaysMood);
    return (
      <section className="ss-card flex items-center gap-3 p-4">
        <Heart className="h-4 w-4 text-primary" aria-hidden />
        <p className="text-body">
          Tu t&apos;es senti{" "}
          <span className="font-medium">{m?.label.toLowerCase()}</span>{" "}
          aujourd&apos;hui {m?.emoji}. Bonne journée.
        </p>
      </section>
    );
  }

  return (
    <section className="ss-card p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-body font-medium">
            Comment tu te sens aujourd&apos;hui ?
          </h2>
          <p className="text-caption text-muted mt-0.5">
            Une seconde pour faire le point. Personne d&apos;autre ne le voit.
          </p>
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
          {MOODS.map((m) => (
            <button
              key={m.value}
              type="submit"
              name="mood"
              value={m.value}
              disabled={submitting !== null}
              className="ss-button-ghost h-9 px-3 text-caption disabled:opacity-50"
              title={m.label}
            >
              <span aria-hidden>{m.emoji}</span>
              <span className="hidden sm:inline">{m.label}</span>
            </button>
          ))}
        </form>
      </div>
    </section>
  );
}
