import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const CSV_COLUMNS = [
  "id",
  "channel_id",
  "platform_comment_id",
  "author_name",
  "text",
  "category",
  "is_toxic",
  "toxicity_score",
  "is_hidden",
  "is_saved_to_wall",
  "replied_at",
  "published_at",
  "video_id",
  "video_title",
  "created_at",
] as const;

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export async function GET(request: NextRequest) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("plan")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.plan !== "pro") {
    return NextResponse.redirect(new URL("/settings?upgrade=1", request.url));
  }

  const { data: channels } = await supabase
    .from("channels")
    .select("id")
    .eq("user_id", user.id);
  const channelIds = (channels ?? []).map((c) => c.id);

  if (channelIds.length === 0) {
    return new NextResponse("Aucune chaîne connectée\n", {
      status: 200,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  const { data: rows } = await supabase
    .from("comments")
    .select(CSV_COLUMNS.join(","))
    .in("channel_id", channelIds)
    .order("published_at", { ascending: false })
    .limit(10000);

  const lines = [CSV_COLUMNS.join(",")];
  for (const r of (rows ?? []) as unknown as Record<string, unknown>[]) {
    lines.push(CSV_COLUMNS.map((col) => csvEscape(r[col])).join(","));
  }
  const body = lines.join("\n") + "\n";

  const filename = `safespace-comments-${new Date()
    .toISOString()
    .slice(0, 10)}.csv`;

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
