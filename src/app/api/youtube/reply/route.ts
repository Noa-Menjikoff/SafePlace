import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getValidAccessToken, postCommentReply } from "@/lib/youtube";
import { hasProFeatures, normalizePlan } from "@/lib/plans";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_BATCH = 25;

type ReplyOutcome =
  | { commentId: string; ok: true; replyId: string }
  | { commentId: string; ok: false; error: string };

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
    .select("plan")
    .eq("id", user.id)
    .maybeSingle();

  if (!hasProFeatures(normalizePlan(profile?.plan))) {
    return NextResponse.json({ error: "pro_only" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const commentIds = Array.isArray(body?.commentIds)
    ? (body.commentIds as unknown[]).filter(
        (x): x is string => typeof x === "string"
      )
    : [];
  const text = typeof body?.text === "string" ? body.text.trim() : "";

  if (commentIds.length === 0 || !text) {
    return NextResponse.json({ error: "missing_params" }, { status: 400 });
  }
  if (commentIds.length > MAX_BATCH) {
    return NextResponse.json(
      { error: "too_many_comments", max: MAX_BATCH },
      { status: 400 }
    );
  }
  if (text.length > 2000) {
    return NextResponse.json({ error: "text_too_long" }, { status: 400 });
  }

  // Récupère les commentaires + le channel_id (vérifie ownership).
  const { data: comments } = await supabase
    .from("comments")
    .select("id, channel_id, platform_comment_id, replied_at")
    .in("id", commentIds);

  if (!comments || comments.length === 0) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const channelIds = Array.from(new Set(comments.map((c) => c.channel_id)));
  const { data: ownedChannels } = await supabase
    .from("channels")
    .select(
      "id, user_id, platform, platform_id, name, thumbnail_url, access_token, refresh_token, token_expires_at, subscriber_count"
    )
    .in("id", channelIds)
    .eq("user_id", user.id);

  const channelById = new Map(
    (ownedChannels ?? []).map((c) => [c.id, c] as const)
  );

  if (channelById.size === 0) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // Cache des access tokens par channel pour ne pas refresh inutilement.
  const tokenByChannel = new Map<string, string>();
  const admin = createSupabaseAdminClient();
  const outcomes: ReplyOutcome[] = [];

  for (const c of comments) {
    if (!channelById.has(c.channel_id)) {
      outcomes.push({
        commentId: c.id,
        ok: false,
        error: "forbidden",
      });
      continue;
    }
    if (c.replied_at) {
      // Already replied — skip silently.
      outcomes.push({
        commentId: c.id,
        ok: false,
        error: "already_replied",
      });
      continue;
    }

    let token = tokenByChannel.get(c.channel_id);
    if (!token) {
      try {
        token = await getValidAccessToken(channelById.get(c.channel_id)!);
        tokenByChannel.set(c.channel_id, token);
      } catch (e) {
        outcomes.push({
          commentId: c.id,
          ok: false,
          error: e instanceof Error ? e.message : "token_error",
        });
        continue;
      }
    }

    try {
      const { id: replyId } = await postCommentReply(
        token,
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

  return NextResponse.json({ outcomes, succeeded, failed });
}
