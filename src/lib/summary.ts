import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { generateTldr, type TldrInsight } from "@/lib/gemini";
import {
  computeCommunityScore,
  positiveRatio,
  type CategoryBreakdown,
} from "@/lib/score";

export const SUMMARY_WINDOW_DAYS = 7;
export const SUMMARY_MIN_COMMENTS = 5;
export const SUMMARY_MAX_COMMENTS_FOR_PROMPT = 200;

export type SummaryRow = {
  id: string;
  channel_id: string;
  week_start: string;
  insights: TldrInsight[] | null;
  raw_count: number | null;
  positive_ratio: number | null;
  community_score: number | null;
  created_at: string;
};

function isoMonday(date: Date): string {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  const day = d.getUTCDay(); // 0=Sun, 1=Mon ...
  const offset = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}

export type GenerateSummaryOptions = {
  language?: "fr" | "en";
};

export async function generateChannelSummary(
  channelId: string,
  options: GenerateSummaryOptions = {}
): Promise<
  | { ok: true; summary: SummaryRow; insufficient?: false }
  | { ok: false; reason: "insufficient_data"; total: number }
> {
  const language = options.language ?? "fr";
  const admin = createSupabaseAdminClient();

  const sinceISO = new Date(
    Date.now() - SUMMARY_WINDOW_DAYS * 24 * 60 * 60 * 1000
  ).toISOString();

  const { data: comments, error } = await admin
    .from("comments")
    .select("text, category, is_toxic")
    .eq("channel_id", channelId)
    .gte("published_at", sinceISO)
    .not("category", "is", null)
    .order("published_at", { ascending: false });

  if (error) {
    throw new Error(`Fetching comments for summary failed: ${error.message}`);
  }

  const total = comments?.length ?? 0;
  if (total < SUMMARY_MIN_COMMENTS) {
    return { ok: false, reason: "insufficient_data", total };
  }

  const breakdown: CategoryBreakdown = {
    question: 0,
    positive: 0,
    constructive: 0,
    neutral: 0,
    toxic: 0,
    total,
  };
  for (const c of comments ?? []) {
    if (c.is_toxic) breakdown.toxic += 1;
    if (c.category === "question") breakdown.question += 1;
    else if (c.category === "positive") breakdown.positive += 1;
    else if (c.category === "constructive") breakdown.constructive += 1;
    else if (c.category === "neutral") breakdown.neutral += 1;
  }

  // On exclut les commentaires toxiques du contexte envoyé à l'IA
  // pour éviter d'orienter le résumé sur le bruit.
  const sample = (comments ?? [])
    .filter((c) => !c.is_toxic && c.text)
    .slice(0, SUMMARY_MAX_COMMENTS_FOR_PROMPT)
    .map((c) => ({
      text: c.text as string,
      category: (c.category as string | null) ?? null,
    }));

  let insights: TldrInsight[];
  try {
    insights = await generateTldr({
      comments: sample,
      breakdown: {
        positive: breakdown.positive,
        question: breakdown.question,
        constructive: breakdown.constructive,
        neutral: breakdown.neutral,
        total,
      },
      language,
    });
  } catch (e) {
    console.error("Gemini TL;DR failed", e);
    throw new Error(
      `TL;DR generation failed: ${e instanceof Error ? e.message : "unknown"}`
    );
  }

  const score = computeCommunityScore(breakdown);
  const ratio = positiveRatio(breakdown);
  const weekStart = isoMonday(new Date());

  // Upsert sur (channel_id, week_start) — on garde une seule version par semaine.
  const { data: upserted, error: upsertError } = await admin
    .from("summaries")
    .upsert(
      {
        channel_id: channelId,
        week_start: weekStart,
        insights,
        raw_count: total,
        positive_ratio: ratio,
        community_score: score,
      },
      { onConflict: "channel_id,week_start" }
    )
    .select()
    .single();

  if (upsertError || !upserted) {
    throw new Error(
      `Summary upsert failed: ${upsertError?.message ?? "no row returned"}`
    );
  }

  return { ok: true, summary: upserted as SummaryRow };
}
