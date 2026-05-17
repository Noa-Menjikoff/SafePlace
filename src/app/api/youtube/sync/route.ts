import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { syncChannelComments } from "@/lib/youtube-sync";
import { classifyChannelPending } from "@/lib/classify";
import { normalizePlan } from "@/lib/plans";
import type { StoredChannel } from "@/lib/youtube";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const formData = await request.formData().catch(() => null);
  const channelIdParam = formData?.get("channelId");
  const wantsRedirect = formData?.get("redirect") === "1";
  const skipClassify = formData?.get("skipClassify") === "1";

  const baseQuery = supabase
    .from("channels")
    .select(
      "id, user_id, platform, platform_id, name, thumbnail_url, access_token, refresh_token, token_expires_at, subscriber_count"
    )
    .eq("user_id", user.id)
    .eq("platform", "youtube");

  const { data: channels, error } = typeof channelIdParam === "string"
    ? await baseQuery.eq("id", channelIdParam)
    : await baseQuery;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!channels || channels.length === 0) {
    return NextResponse.json({ error: "no_channel" }, { status: 404 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("plan")
    .eq("id", user.id)
    .maybeSingle();
  const plan = normalizePlan(profile?.plan);

  type SyncOutcome = {
    channelId: string;
    fetched: number;
    inserted: number;
    classified: number;
    failedBatches: number;
    cap: number;
    ok: boolean;
    error?: string;
  };

  const results: SyncOutcome[] = [];
  for (const channel of channels as StoredChannel[]) {
    let synced;
    try {
      synced = await syncChannelComments(channel, plan);
    } catch (e) {
      console.error("Sync failed for channel", channel.id, e);
      results.push({
        channelId: channel.id,
        fetched: 0,
        inserted: 0,
        classified: 0,
        failedBatches: 0,
        cap: 0,
        ok: false,
        error: e instanceof Error ? e.message : "unknown",
      });
      continue;
    }

    let classifyOutcome = { classified: 0, failedBatches: 0 };
    if (!skipClassify) {
      try {
        const c = await classifyChannelPending(channel.id);
        classifyOutcome = {
          classified: c.classified,
          failedBatches: c.failedBatches,
        };
      } catch (e) {
        console.error("Classify failed", channel.id, e);
        classifyOutcome = { classified: 0, failedBatches: 1 };
      }
    }

    results.push({
      channelId: channel.id,
      fetched: synced.fetched,
      inserted: synced.inserted,
      classified: classifyOutcome.classified,
      failedBatches: classifyOutcome.failedBatches,
      cap: synced.cap,
      ok: true,
    });
  }

  if (wantsRedirect) {
    const totalInserted = results
      .filter((r) => r.ok)
      .reduce((sum, r) => sum + r.inserted, 0);
    const totalClassified = results
      .filter((r) => r.ok)
      .reduce((sum, r) => sum + r.classified, 0);
    const hasError = results.some((r) => !r.ok);
    const url = new URL("/settings", request.url);
    url.searchParams.set("sync", hasError ? "error" : "done");
    url.searchParams.set("count", String(totalInserted));
    url.searchParams.set("classified", String(totalClassified));
    return NextResponse.redirect(url, { status: 303 });
  }

  return NextResponse.json({ results });
}
