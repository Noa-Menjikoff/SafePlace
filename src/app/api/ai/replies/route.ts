import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { generateReplies } from "@/lib/gemini";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(request: NextRequest) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const commentId = body?.commentId;

  if (typeof commentId !== "string") {
    return NextResponse.json({ error: "missing_comment_id" }, { status: 400 });
  }

  const { data: comment } = await supabase
    .from("comments")
    .select("id, channel_id, text")
    .eq("id", commentId)
    .maybeSingle();

  if (!comment) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const { data: ownsChannel } = await supabase
    .from("channels")
    .select("id")
    .eq("id", comment.channel_id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!ownsChannel) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("language")
    .eq("id", user.id)
    .maybeSingle();
  const language = (profile?.language as "fr" | "en" | undefined) ?? "fr";

  try {
    const replies = await generateReplies(comment.text ?? "", language);
    return NextResponse.json({ replies });
  } catch (e) {
    console.error("generateReplies failed", e);
    return NextResponse.json(
      { error: "generation_failed" },
      { status: 502 }
    );
  }
}
