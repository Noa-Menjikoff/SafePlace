"use client";

import { useState } from "react";
import {
  Sparkles,
  Send,
  Users,
  Film,
  Quote,
  Check,
  AlertTriangle,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Question = {
  id: string;
  text: string;
  authorName: string | null;
  videoId: string | null;
  videoTitle: string | null;
};

type Group = {
  title: string;
  videoTitle: string | null;
  commentIds: string[];
  drafts: string[];
};

type SendOutcome = {
  succeeded: number;
  failed: number;
};

export function QuickReplyBoard({
  initialQuestions,
}: {
  initialQuestions: Question[];
}) {
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function group() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/group-questions", { method: "POST" });
      if (!res.ok) {
        if (res.status === 403) throw new Error("Cette fonction est réservée au plan Pro.");
        throw new Error("Le groupement a échoué. Réessaie.");
      }
      const data = (await res.json()) as { groups: Group[] };
      setGroups(data.groups ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inconnue");
    } finally {
      setLoading(false);
    }
  }

  if (initialQuestions.length === 0) {
    return (
      <div className="ss-card p-10 text-center">
        <Sparkles className="h-6 w-6 mx-auto text-primary-mid" aria-hidden />
        <h2 className="text-h2 mt-3">Aucune question en attente</h2>
        <p className="text-muted mt-2 max-w-md mx-auto">
          Quand de nouvelles questions arriveront, on les regroupera ici pour
          que tu puisses répondre en un seul mouvement.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="ss-card p-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-body font-medium">
            {initialQuestions.length} question
            {initialQuestions.length > 1 ? "s" : ""} en attente de réponse
          </p>
          <p className="text-caption text-muted mt-0.5">
            L&apos;IA peut regrouper celles qui se ressemblent et te proposer
            3 brouillons de réponse par groupe.
          </p>
        </div>
        <button
          type="button"
          onClick={group}
          disabled={loading}
          className="ss-button-primary disabled:opacity-50"
        >
          {loading ? (
            <RefreshCw className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Sparkles className="h-4 w-4" aria-hidden />
          )}
          {groups
            ? loading
              ? "Re-groupement…"
              : "Re-grouper"
            : loading
            ? "Analyse…"
            : "Grouper avec l'IA"}
        </button>
      </section>

      {error ? (
        <div className="ss-card flex items-start gap-3 border-amber/30 bg-amber-light p-4">
          <AlertTriangle className="h-4 w-4 mt-0.5 text-amber" aria-hidden />
          <p className="text-caption text-amber">{error}</p>
        </div>
      ) : null}

      {groups === null ? (
        <ul className="grid gap-3 sm:grid-cols-2">
          {initialQuestions.slice(0, 6).map((q) => (
            <li
              key={q.id}
              className="ss-card p-4 flex flex-col gap-2 opacity-70"
            >
              <p className="text-caption text-muted">
                {q.authorName ?? "Anonyme"}
                {q.videoTitle ? ` · ${q.videoTitle}` : ""}
              </p>
              <p className="text-body line-clamp-3">{q.text}</p>
            </li>
          ))}
        </ul>
      ) : groups.length === 0 ? (
        <div className="ss-card p-8 text-center text-muted text-caption">
          Pas de groupes pertinents trouvés. Réessaie après plus de questions.
        </div>
      ) : (
        <ul className="flex flex-col gap-4">
          {groups.map((g, i) => (
            <li key={i}>
              <GroupCard group={g} questions={initialQuestions} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function GroupCard({
  group,
  questions,
}: {
  group: Group;
  questions: Question[];
}) {
  const [text, setText] = useState(group.drafts[0] ?? "");
  const [selected, setSelected] = useState(0);
  const [sending, setSending] = useState(false);
  const [outcome, setOutcome] = useState<SendOutcome | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);

  const example = questions.find((q) => group.commentIds.includes(q.id));
  const count = group.commentIds.length;
  const sent = outcome !== null;

  async function send() {
    if (!text.trim()) return;
    setSending(true);
    setSendError(null);
    try {
      const res = await fetch("/api/youtube/reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          commentIds: group.commentIds,
          text: text.trim(),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error ?? `HTTP ${res.status}`);
      }
      const data = (await res.json()) as SendOutcome;
      setOutcome(data);
    } catch (e) {
      setSendError(e instanceof Error ? e.message : "Erreur inconnue");
    } finally {
      setSending(false);
    }
  }

  return (
    <article className="ss-card p-5 flex flex-col gap-4">
      <header className="flex flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="ss-pill-blue">
            <Users className="h-3 w-3" aria-hidden />
            {count} personne{count > 1 ? "s" : ""}
          </span>
          {group.videoTitle ? (
            <span className="ss-pill-primary">
              <Film className="h-3 w-3" aria-hidden />
              {group.videoTitle}
            </span>
          ) : null}
        </div>
        <h3 className="text-h2">{group.title}</h3>
      </header>

      {example ? (
        <div className="rounded-md bg-bg/40 border border-border p-3 flex gap-3">
          <Quote className="h-4 w-4 text-muted shrink-0 mt-0.5" aria-hidden />
          <div className="flex-1 min-w-0">
            <p className="text-caption text-muted">
              {example.authorName ?? "Anonyme"}
            </p>
            <p className="text-body mt-0.5">{example.text}</p>
          </div>
        </div>
      ) : null}

      <div className="flex flex-col gap-2">
        <p className="text-caption text-muted font-medium">
          3 brouillons générés
        </p>
        <div className="grid gap-2 sm:grid-cols-3">
          {group.drafts.map((draft, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => {
                setSelected(idx);
                setText(draft);
              }}
              disabled={sent}
              className={cn(
                "text-left rounded-md border p-3 text-caption transition-colors duration-200",
                selected === idx
                  ? "border-primary bg-primary-light text-ink"
                  : "border-border bg-card hover:bg-bg/40"
              )}
            >
              {draft}
            </button>
          ))}
        </div>
      </div>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        maxLength={2000}
        disabled={sent}
        placeholder="Édite la réponse avant envoi…"
        className="w-full rounded-md border border-border bg-card p-3 text-body focus:outline-none focus:ring-2 focus:ring-primary-mid disabled:opacity-60"
      />

      <footer className="flex items-center justify-between gap-3">
        <p className="text-caption text-muted">
          {text.length}/2000
        </p>
        {sent ? (
          <p className="inline-flex items-center gap-2 text-caption text-teal font-medium">
            <Check className="h-3.5 w-3.5" aria-hidden />
            {outcome!.succeeded} envoyé{outcome!.succeeded > 1 ? "s" : ""}
            {outcome!.failed > 0 ? ` · ${outcome!.failed} échec` : ""}
          </p>
        ) : (
          <button
            type="button"
            onClick={send}
            disabled={sending || !text.trim()}
            className="ss-button-primary disabled:opacity-50"
          >
            {sending ? (
              <RefreshCw className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Send className="h-4 w-4" aria-hidden />
            )}
            {sending
              ? "Envoi…"
              : `Envoyer à ${count} personne${count > 1 ? "s" : ""}`}
          </button>
        )}
      </footer>

      {sendError ? (
        <p className="text-caption text-amber">{sendError}</p>
      ) : null}
    </article>
  );
}
