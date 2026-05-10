import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { groupQuestions } from "@/lib/gemini";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_QUESTIONS_PER_RUN = 80;

export async function POST(request: NextRequest) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("plan, language")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.plan !== "pro") {
    return NextResponse.json({ error: "pro_only" }, { status: 403 });
  }

  const language = (profile?.language as "fr" | "en" | undefined) ?? "fr";

  const { data: channels } = await supabase
    .from("channels")
    .select("id")
    .eq("user_id", user.id);

  const channelIds = (channels ?? []).map((c) => c.id);
  if (channelIds.length === 0) {
    return NextResponse.json({ groups: [] });
  }

  const { data: questions } = await supabase
    .from("comments")
    .select("id, text, video_title")
    .in("channel_id", channelIds)
    .eq("category", "question")
    .eq("is_toxic", false)
    .eq("is_hidden", false)
    .is("replied_at", null)
    .order("published_at", { ascending: false })
    .limit(MAX_QUESTIONS_PER_RUN);

  if (!questions || questions.length === 0) {
    return NextResponse.json({ groups: [] });
  }

  try {
    const groups = await groupQuestions(
      questions.map((q) => ({
        id: q.id,
        text: q.text ?? "",
        videoTitle: q.video_title ?? null,
      })),
      language
    );
    return NextResponse.json({ groups });
  } catch (e) {
    console.error("groupQuestions failed", e);
    return NextResponse.json(
      { error: "generation_failed" },
      { status: 502 }
    );
  }
}
