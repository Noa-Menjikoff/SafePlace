"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { MessageSquareReply, Send } from "lucide-react";
import { cn } from "@/lib/utils";

const MAX_LENGTH = 2000;

/**
 * Formulaire de réponse en masse à un topic. Client component car on POST
 * du JSON, on gère un état d'ouverture (collapsable), et on affiche
 * un état de chargement / résultat sans full page reload.
 */
export function TopicReplyForm({
  topicId,
  pendingCount,
}: {
  topicId: string;
  pendingCount: number;
}) {
  const router = useRouter();
  const t = useTranslations("ideas.card");
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();

  if (pendingCount === 0) return null;

  function submit() {
    if (!text.trim() || pending) return;
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/topics/${topicId}/reply`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: text.trim() }),
        });
        const data = (await res.json().catch(() => null)) as {
          succeeded?: number;
          failed?: number;
          error?: string;
        } | null;
        if (!res.ok || !data) {
          throw new Error(data?.error ?? "HTTP " + res.status);
        }
        setDone(data.succeeded ?? 0);
        setText("");
        setOpen(false);
        router.refresh();
      } catch (e) {
        console.error(e);
        setError(t("replyError"));
      }
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          setDone(null);
          setError(null);
        }}
        className="ss-button-primary h-9 px-3 text-caption"
      >
        <MessageSquareReply className="h-3.5 w-3.5" aria-hidden />
        {t("reply")}
      </button>
    );
  }

  return (
    <div className="w-full flex flex-col gap-2 rounded-md border border-border bg-card p-3">
      <p className="text-caption text-muted">{t("replyHelp")}</p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value.slice(0, MAX_LENGTH))}
        placeholder={t("replyPlaceholder")}
        rows={3}
        disabled={pending}
        className="w-full resize-none rounded-md border border-border bg-bg/40 px-3 py-2 text-body focus:outline-none focus:border-primary"
      />
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={pending || !text.trim()}
          className={cn(
            "ss-button-primary h-9 px-3 text-caption",
            (pending || !text.trim()) && "opacity-60 cursor-not-allowed"
          )}
        >
          <Send className="h-3.5 w-3.5" aria-hidden />
          {pending
            ? t("replySending")
            : t("replySend", { count: pendingCount })}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setError(null);
          }}
          disabled={pending}
          className="ss-button-ghost h-9 px-3 text-caption"
        >
          {t("replyCancel")}
        </button>
        {error ? (
          <span className="text-caption text-amber ml-auto">{error}</span>
        ) : null}
        {done !== null && !error ? (
          <span className="text-caption text-teal ml-auto">
            {t("replyDone", { count: done })}
          </span>
        ) : null}
      </div>
    </div>
  );
}
