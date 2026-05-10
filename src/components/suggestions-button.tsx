"use client";

import { useState } from "react";
import { Sparkles, Copy, Check, X } from "lucide-react";
import { cn } from "@/lib/utils";

type Status = "idle" | "loading" | "ready" | "error";

export function SuggestionsButton({
  commentId,
  className,
}: {
  commentId: string;
  className?: string;
}) {
  const [status, setStatus] = useState<Status>("idle");
  const [replies, setReplies] = useState<string[]>([]);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  async function load() {
    setStatus("loading");
    try {
      const res = await fetch("/api/ai/replies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ commentId }),
      });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const data = (await res.json()) as { replies: string[] };
      setReplies(data.replies ?? []);
      setStatus("ready");
    } catch (e) {
      console.error(e);
      setStatus("error");
    }
  }

  function copy(text: string, idx: number) {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedIndex(idx);
      setTimeout(() => setCopiedIndex((c) => (c === idx ? null : c)), 1500);
    });
  }

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {status !== "ready" ? (
        <button
          type="button"
          onClick={load}
          disabled={status === "loading"}
          className="ss-button-ghost h-9 px-3 text-caption disabled:opacity-50"
        >
          <Sparkles className="h-3.5 w-3.5" aria-hidden />
          {status === "loading" ? "Génération…" : "Suggestions IA"}
        </button>
      ) : null}

      {status === "error" ? (
        <p className="text-caption text-amber">
          Échec de la génération. Réessaie.
        </p>
      ) : null}

      {status === "ready" && replies.length > 0 ? (
        <div className="flex flex-col gap-2 rounded-md border border-border bg-bg/40 p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-caption text-muted font-medium">
              3 brouillons générés
            </p>
            <button
              type="button"
              onClick={() => {
                setStatus("idle");
                setReplies([]);
              }}
              className="text-muted hover:text-ink"
              aria-label="Fermer"
            >
              <X className="h-3.5 w-3.5" aria-hidden />
            </button>
          </div>
          {replies.map((r, i) => (
            <div
              key={i}
              className="flex items-start gap-2 rounded-md bg-card p-3 border border-border"
            >
              <p className="flex-1 text-body">{r}</p>
              <button
                type="button"
                onClick={() => copy(r, i)}
                className="ss-button-ghost h-8 px-2 text-caption shrink-0"
                aria-label="Copier"
              >
                {copiedIndex === i ? (
                  <>
                    <Check className="h-3 w-3" aria-hidden />
                    Copié
                  </>
                ) : (
                  <>
                    <Copy className="h-3 w-3" aria-hidden />
                    Copier
                  </>
                )}
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={load}
            className="ss-button-ghost h-9 px-3 text-caption self-start"
          >
            <Sparkles className="h-3.5 w-3.5" aria-hidden />
            Régénérer
          </button>
        </div>
      ) : null}
    </div>
  );
}
