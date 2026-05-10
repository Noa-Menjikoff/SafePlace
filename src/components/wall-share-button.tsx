"use client";

import { useState, type RefObject } from "react";
import { Share2, Check, Download } from "lucide-react";
import { cn } from "@/lib/utils";

type Status = "idle" | "working" | "copied" | "downloaded" | "error";

export function WallShareButton({
  targetRef,
  className,
}: {
  targetRef: RefObject<HTMLDivElement>;
  className?: string;
}) {
  const [status, setStatus] = useState<Status>("idle");

  async function share() {
    if (!targetRef.current) return;
    setStatus("working");
    try {
      const html2canvas = (await import("html2canvas")).default;
      const canvas = await html2canvas(targetRef.current, {
        backgroundColor: null,
        scale: 2,
        useCORS: true,
      });

      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob((b) => resolve(b), "image/png")
      );
      if (!blob) throw new Error("blob_null");

      // Try clipboard first.
      if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
        try {
          await navigator.clipboard.write([
            new ClipboardItem({ "image/png": blob }),
          ]);
          setStatus("copied");
          setTimeout(() => setStatus("idle"), 2000);
          return;
        } catch {
          /* fallthrough */
        }
      }

      // Fallback: download.
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `safespace-${Date.now()}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setStatus("downloaded");
      setTimeout(() => setStatus("idle"), 2000);
    } catch (e) {
      console.error(e);
      setStatus("error");
      setTimeout(() => setStatus("idle"), 2000);
    }
  }

  const label =
    status === "working"
      ? "Capture…"
      : status === "copied"
      ? "Copié"
      : status === "downloaded"
      ? "Téléchargé"
      : status === "error"
      ? "Erreur"
      : "Partager";

  const Icon =
    status === "copied"
      ? Check
      : status === "downloaded"
      ? Download
      : Share2;

  return (
    <button
      type="button"
      onClick={share}
      disabled={status === "working"}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md bg-card/80 backdrop-blur px-2.5 py-1.5 text-caption font-medium text-ink/80 hover:text-ink shadow-card transition-colors duration-200 disabled:opacity-50",
        className
      )}
      aria-label="Partager la carte en image"
    >
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {label}
    </button>
  );
}
