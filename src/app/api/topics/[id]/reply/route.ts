import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getValidAccessToken, postCommentReply } from "@/lib/youtube";
import { hasProFeatures, normalizePlan } from "@/lib/plans";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_REPLIES_PER_TOPIC = 50;

type ReplyOutcome =
  | { commentId: string; ok: true; replyId: string }
  | { commentId: string; ok: false; error: string };

/**
 * Réponse en masse à toutes les questions d'un topic. Réservé Pro & Shield
 * (cohérent avec /api/youtube/reply). Le créateur passe un `text` qui sera
 * publié sous TOUS les commentaires rattachés au topic (non encore répondus).
 *
 * Marque automatiquement le topic comme `answered` une fois l'envoi réussi.
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

  const { data: profile } = await supabase
    .from("profiles")
    .select("plan")
    .eq("id", user.id)
    .maybeSingle();

  if (!hasProFeatures(normalizePlan(profile?.plan))) {
    return NextResponse.json({ error: "pro_only" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (!text) {
    return NextResponse.json({ error: "missing_text" }, { status: 400 });
  }
  if (text.length > 2000) {
    return NextResponse.json({ error: "text_too_long" }, { status: 400 });
  }

  // Récupère le topic + verify ownership
  const { data: topic } = await supabase
    .from("question_topics")
    .select("id, channel_id, status")
    .eq("id", params.id)
    .maybeSingle();

  if (!topic) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const { data: channel } = await supabase
    .from("channels")
    .select(
      "id, user_id, platform, platform_id, name, thumbnail_url, access_token, refresh_token, token_expires_at, subscriber_count"
    )
    .eq("id", topic.channel_id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!channel) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // Récupère les commentaires du topic non encore répondus
  const { data: comments } = await supabase
    .from("comments")
    .select("id, platform_comment_id, replied_at")
    .eq("topic_id", topic.id)
    .eq("channel_id", topic.channel_id)
    .is("replied_at", null)
    .limit(MAX_REPLIES_PER_TOPIC);

  if (!comments || comments.length === 0) {
    return NextResponse.json({ error: "no_comments_to_reply" }, { status: 400 });
  }

  let accessToken: string;
  try {
    accessToken = await getValidAccessToken(channel);
  } catch (e) {
    return NextResponse.json(
      {
        error: "token_error",
        detail: e instanceof Error ? e.message : "unknown",
      },
      { status: 500 }
    );
  }

  const admin = createSupabaseAdminClient();
  const outcomes: ReplyOutcome[] = [];

  for (const c of comments) {
    try {
      const { id: replyId } = await postCommentReply(
        accessToken,
        c.platform_comment_id,
        text
      );
      await admin
        .from("comments")
        .update({ replied_at: new Date().toISOString() })
        .eq("id", c.id);
      outcomes.push({ commentId: c.id, ok: true, replyId });
    } catch (e) {
      outcomes.push({
        commentId: c.id,
        ok: false,
        error: e instanceof Error ? e.message : "post_failed",
      });
    }
  }

  const succeeded = outcomes.filter((o) => o.ok).length;
  const failed = outcomes.length - succeeded;

  // Si au moins une réponse réussie, on marque le topic comme answered.
  if (succeeded > 0 && topic.status !== "answered") {
    const now = new Date().toISOString();
    await admin
      .from("question_topics")
      .update({
        status: "answered",
        answered_at: now,
        updated_at: now,
      })
      .eq("id", topic.id);
  }

  return NextResponse.json({ outcomes, succeeded, failed });
}
