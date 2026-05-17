import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { generateChannelSummary } from "@/lib/summary";
import { sendDigests } from "@/lib/threat-detection";
import { isAuthorizedCron } from "@/lib/cron-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const TIME_BUDGET_MS = 280_000;
const MAX_CHANNELS_PER_RUN = 200;

export async function GET(request: NextRequest) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createSupabaseAdminClient();

  const { data: channels, error } = await admin
    .from("channels")
    .select("id, user_id")
    .eq("platform", "youtube")
    .order("created_at", { ascending: true })
    .limit(MAX_CHANNELS_PER_RUN);

  if (error) {
    console.error("cron generate-summaries: list channels failed", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const userIds = Array.from(
    new Set((channels ?? []).map((c) => c.user_id))
  );
  const langByUser = new Map<string, "fr" | "en">();
  if (userIds.length > 0) {
    const { data: profiles } = await admin
      .from("profiles")
      .select("id, language")
      .in("id", userIds);
    for (const p of profiles ?? []) {
      langByUser.set(p.id, (p.language as "fr" | "en") ?? "fr");
    }
  }

  const startedAt = Date.now();
  const results: Array<{
    channelId: string;
    ok: boolean;
    insufficient?: boolean;
    error?: string;
  }> = [];

  let processed = 0;
  let skipped = 0;

  for (const channel of channels ?? []) {
    if (Date.now() - startedAt > TIME_BUDGET_MS) {
      skipped += 1;
      continue;
    }

    const language = langByUser.get(channel.user_id) ?? "fr";

    try {
      const r = await generateChannelSummary(channel.id, { language });
      if (r.ok) {
        results.push({ channelId: channel.id, ok: true });
      } else {
        results.push({
          channelId: channel.id,
          ok: false,
          insufficient: r.reason === "insufficient_data",
        });
      }
    } catch (e) {
      console.error(
        "cron generate-summaries: failed",
        channel.id,
        e
      );
      results.push({
        channelId: channel.id,
        ok: false,
        error: e instanceof Error ? e.message : "unknown",
      });
    }

    processed += 1;
  }

  // Digest hebdomadaire — chaîné ici car le cron tourne le lundi matin.
  let digest: Awaited<ReturnType<typeof sendDigests>> | null = null;
  try {
    digest = await sendDigests("digest_weekly");
  } catch (e) {
    console.error("cron generate-summaries: weekly digest failed", e);
  }

  const summary = {
    ranAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
    processed,
    skipped,
    succeeded: results.filter((r) => r.ok).length,
    insufficient: results.filter((r) => !r.ok && r.insufficient).length,
    failed: results.filter((r) => !r.ok && !r.insufficient).length,
    digestUsersEmailed: digest?.usersEmailed ?? 0,
    digestAlertsSent: digest?.alertsSent ?? 0,
  };

  console.log("cron generate-summaries done", summary);

  return NextResponse.json({ summary, results });
}
