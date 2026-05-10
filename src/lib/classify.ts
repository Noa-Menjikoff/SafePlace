import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { classifyBatch } from "@/lib/gemini";

export const CLASSIFY_BATCH_SIZE = 40;
export const CLASSIFY_MAX_PER_RUN = 400;
export const CLASSIFY_TEXT_TRUNCATE = 600;

export type ClassifyChannelResult = {
  channelId: string;
  pending: number;
  classified: number;
  failedBatches: number;
};

export type ClassifyOptions = {
  /** If true, also re-classifies comments that already have a category. */
  force?: boolean;
};

export async function classifyChannelPending(
  channelId: string,
  options: ClassifyOptions = {}
): Promise<ClassifyChannelResult> {
  const admin = createSupabaseAdminClient();

  const baseQuery = admin
    .from("comments")
    .select("id, text")
    .eq("channel_id", channelId)
    .order("published_at", { ascending: false })
    .limit(CLASSIFY_MAX_PER_RUN);

  const { data: pending, error } = options.force
    ? await baseQuery
    : await baseQuery.is("category", null);

  if (error) {
    throw new Error(`Fetching pending comments failed: ${error.message}`);
  }

  if (!pending || pending.length === 0) {
    return {
      channelId,
      pending: 0,
      classified: 0,
      failedBatches: 0,
    };
  }

  let classified = 0;
  let failedBatches = 0;

  for (let i = 0; i < pending.length; i += CLASSIFY_BATCH_SIZE) {
    const chunk = pending.slice(i, i + CLASSIFY_BATCH_SIZE).map((c) => ({
      id: c.id,
      text: (c.text ?? "").slice(0, CLASSIFY_TEXT_TRUNCATE),
    }));

    let results;
    try {
      results = await classifyBatch(chunk);
    } catch (e) {
      failedBatches += 1;
      console.error("Gemini classify batch failed", e);
      continue;
    }

    if (results.length === 0) continue;

    const updates = await Promise.all(
      results.map((r) =>
        admin
          .from("comments")
          .update({
            category: r.category,
            is_toxic: r.is_toxic,
            toxicity_score: r.toxicity_score,
          })
          .eq("id", r.id)
          .eq("channel_id", channelId)
      )
    );

    classified += updates.filter((u) => !u.error).length;
  }

  return {
    channelId,
    pending: pending.length,
    classified,
    failedBatches,
  };
}
