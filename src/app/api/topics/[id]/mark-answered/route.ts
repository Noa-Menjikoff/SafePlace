import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * Marque un topic comme "answered" — le créateur a publié (ou compte publier)
 * une vidéo qui y répond. On stocke optionnellement le video_id YouTube
 * pour le suivi ROI futur.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const formData = await request.formData().catch(() => null);
  const redirectTo = formData?.get("redirectTo");
  const videoIdParam = formData?.get("videoId");
  const videoId =
    typeof videoIdParam === "string" && videoIdParam.length > 0
      ? videoIdParam.slice(0, 64)
      : null;

  const { data: topic } = await supabase
    .from("question_topics")
    .select("id, channel_id")
    .eq("id", params.id)
    .maybeSingle();

  if (!topic) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const { data: ownsChannel } = await supabase
    .from("channels")
    .select("id")
    .eq("id", topic.channel_id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!ownsChannel) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const now = new Date().toISOString();
  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from("question_topics")
    .update({
      status: "answered",
      answered_video_id: videoId,
      answered_at: now,
      updated_at: now,
    })
    .eq("id", topic.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (typeof redirectTo === "string" && redirectTo.startsWith("/")) {
    return NextResponse.redirect(new URL(redirectTo, request.url), {
      status: 303,
    });
  }
  return NextResponse.json({ ok: true });
}
