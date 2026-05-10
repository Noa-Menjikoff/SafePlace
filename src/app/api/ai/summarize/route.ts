import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { generateChannelSummary } from "@/lib/summary";

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

  const baseQuery = supabase
    .from("channels")
    .select("id")
    .eq("user_id", user.id)
    .eq("platform", "youtube");

  const { data: channels } = typeof channelIdParam === "string"
    ? await baseQuery.eq("id", channelIdParam)
    : await baseQuery.limit(1);

  if (!channels || channels.length === 0) {
    if (wantsRedirect) {
      return NextResponse.redirect(
        new URL("/dashboard?summary=no_channel", request.url),
        { status: 303 }
      );
    }
    return NextResponse.json({ error: "no_channel" }, { status: 404 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("language")
    .eq("id", user.id)
    .maybeSingle();
  const language = (profile?.language as "fr" | "en" | undefined) ?? "fr";

  const results = [];
  for (const channel of channels) {
    try {
      const r = await generateChannelSummary(channel.id, { language });
      results.push({ channelId: channel.id, ...r });
    } catch (e) {
      console.error("Summary failed", channel.id, e);
      results.push({
        channelId: channel.id,
        ok: false as const,
        reason: "error" as const,
        message: e instanceof Error ? e.message : "unknown",
      });
    }
  }

  if (wantsRedirect) {
    const first = results[0];
    const url = new URL("/dashboard", request.url);
    if (first?.ok) url.searchParams.set("summary", "done");
    else if (first && "reason" in first && first.reason === "insufficient_data") {
      url.searchParams.set("summary", "insufficient");
    } else {
      url.searchParams.set("summary", "error");
    }
    return NextResponse.redirect(url, { status: 303 });
  }

  return NextResponse.json({ results });
}
