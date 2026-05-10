"use client";

import { useRef } from "react";
import { Trash2 } from "lucide-react";
import { WallShareButton } from "@/components/wall-share-button";
import { cn } from "@/lib/utils";

export type WallEntry = {
  id: string;
  text: string;
  authorName: string | null;
  createdAt: string;
  isCustom: boolean;
};

const VARIANTS = [
  {
    bg: "bg-primary-light",
    accent: "bg-primary",
    text: "text-primary",
    quote: "text-primary/80",
  },
  {
    bg: "bg-rose-light",
    accent: "bg-rose",
    text: "text-rose",
    quote: "text-rose/80",
  },
  {
    bg: "bg-teal-light",
    accent: "bg-teal",
    text: "text-teal",
    quote: "text-teal/80",
  },
] as const;

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("fr-FR", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  } catch {
    return "";
  }
}

export function SupportWallCard({
  entry,
  index,
}: {
  entry: WallEntry;
  index: number;
}) {
  const v = VARIANTS[index % VARIANTS.length];
  const captureRef = useRef<HTMLDivElement>(null);

  return (
    <div className="relative group">
      <div
        ref={captureRef}
        className={cn(
          "rounded-lg p-6 flex flex-col gap-5 min-h-[220px] transition-shadow duration-200",
          v.bg
        )}
      >
        <div className="flex items-start gap-3">
          <span
            aria-hidden
            className={cn("font-serif text-h1 leading-none", v.quote)}
          >
            “
          </span>
          <p
            className={cn(
              "font-serif text-[18px] leading-[1.5] text-ink/85 whitespace-pre-wrap break-words"
            )}
          >
            {entry.text}
          </p>
        </div>

        <div className="mt-auto flex items-end justify-between gap-3">
          <div className="flex flex-col">
            <span className={cn("text-caption font-medium", v.text)}>
              {entry.authorName ?? "Anonyme"}
            </span>
            <span className="text-caption text-muted">
              {formatDate(entry.createdAt)}
            </span>
          </div>
          <span
            aria-hidden
            className={cn("h-1 w-12 rounded-full", v.accent, "opacity-60")}
          />
        </div>
      </div>

      <div className="absolute top-3 right-3 flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
        <WallShareButton targetRef={captureRef} />
        <form action="/api/wall/delete" method="post">
          <input type="hidden" name="entryId" value={entry.id} />
          <input type="hidden" name="redirectTo" value="/wall" />
          <button
            type="submit"
            className="inline-flex items-center justify-center h-7 w-7 rounded-md bg-card/80 backdrop-blur text-ink/60 hover:text-ink shadow-card transition-colors duration-200"
            aria-label="Retirer du mur"
            title="Retirer"
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden />
          </button>
        </form>
      </div>
    </div>
  );
}
