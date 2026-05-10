import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const formData = await request.formData().catch(() => null);
  const commentId = formData?.get("commentId");
  const customText = formData?.get("customText");
  const authorName = formData?.get("authorName");
  const redirectTo = formData?.get("redirectTo");

  // Cas 1 : ajout manuel via textarea (custom_text), pas de commentId
  if (typeof commentId !== "string") {
    if (typeof customText !== "string" || !customText.trim()) {
      return NextResponse.json({ error: "missing_content" }, { status: 400 });
    }
    const { error } = await supabase.from("support_wall").insert({
      user_id: user.id,
      custom_text: customText.trim().slice(0, 2000),
      author_name:
        typeof authorName === "string" ? authorName.slice(0, 100) : null,
    });
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

  // Cas 2 : ajout depuis un commentaire existant
  const { data: comment } = await supabase
    .from("comments")
    .select("id, channel_id, author_name, text")
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

  // Marque le commentaire comme sauvegardé (pour l'UI) — admin car update RLS.
  const admin = createSupabaseAdminClient();
  await admin
    .from("comments")
    .update({ is_saved_to_wall: true })
    .eq("id", commentId);

  // Insertion idempotente : pas de doublon si déjà sur le mur.
  const { data: existing } = await supabase
    .from("support_wall")
    .select("id")
    .eq("user_id", user.id)
    .eq("comment_id", commentId)
    .maybeSingle();

  if (!existing) {
    const { error } = await supabase.from("support_wall").insert({
      user_id: user.id,
      comment_id: commentId,
      author_name: comment.author_name,
    });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  if (typeof redirectTo === "string" && redirectTo.startsWith("/")) {
    return NextResponse.redirect(new URL(redirectTo, request.url), {
      status: 303,
    });
  }

  return NextResponse.json({ ok: true });
}
