import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { classifyChannelPending } from "@/lib/classify";

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
  const force = formData?.get("force") === "1";
  const wantsRedirect = formData?.get("redirect") === "1";

  const baseQuery = supabase
    .from("channels")
    .select("id")
    .eq("user_id", user.id)
    .eq("platform", "youtube");

  const { data: channels } = typeof channelIdParam === "string"
    ? await baseQuery.eq("id", channelIdParam)
    : await baseQuery;

  if (!channels || channels.length === 0) {
    return NextResponse.json({ error: "no_channel" }, { status: 404 });
  }

  const results = [];
  for (const channel of channels) {
    try {
      results.push(await classifyChannelPending(channel.id, { force }));
    } catch (e) {
      console.error("Classify failed", channel.id, e);
      results.push({
        channelId: channel.id,
        pending: 0,
        classified: 0,
        failedBatches: 1,
        error: e instanceof Error ? e.message : "unknown",
      });
    }
  }

  if (wantsRedirect) {
    const total = results.reduce(
      (sum, r) => sum + ("classified" in r ? r.classified : 0),
      0
    );
    const url = new URL("/dashboard", request.url);
    url.searchParams.set("reclassified", String(total));
    return NextResponse.redirect(url, { status: 303 });
  }

  return NextResponse.json({ results });
}
