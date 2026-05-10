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
  const action = formData?.get("action") ?? "hide"; // "hide" | "unhide"
  const redirectTo = formData?.get("redirectTo");

  if (typeof commentId !== "string") {
    return NextResponse.json({ error: "missing_comment_id" }, { status: 400 });
  }

  // RLS via channels.user_id : on récupère d'abord le channel_id pour vérifier
  // que l'utilisateur possède bien ce commentaire.
  const { data: comment } = await supabase
    .from("comments")
    .select("id, channel_id")
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

  // RLS sur comments n'a qu'une policy SELECT — l'UPDATE doit passer par
  // le service role. Sécurité : on a déjà validé que le user possède le channel.
  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from("comments")
    .update({ is_hidden: action !== "unhide" })
    .eq("id", commentId);

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
