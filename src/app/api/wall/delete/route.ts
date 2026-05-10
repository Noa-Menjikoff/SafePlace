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
  const entryId = formData?.get("entryId");
  const redirectTo = formData?.get("redirectTo");

  if (typeof entryId !== "string") {
    return NextResponse.json({ error: "missing_id" }, { status: 400 });
  }

  // Récupère l'entrée (RLS limite déjà à user_id = auth.uid()).
  const { data: entry } = await supabase
    .from("support_wall")
    .select("id, comment_id")
    .eq("id", entryId)
    .maybeSingle();

  if (!entry) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // Supprime l'entrée du mur.
  const { error } = await supabase
    .from("support_wall")
    .delete()
    .eq("id", entryId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Si l'entrée référençait un commentaire, on désactive le flag de la card.
  if (entry.comment_id) {
    const admin = createSupabaseAdminClient();
    await admin
      .from("comments")
      .update({ is_saved_to_wall: false })
      .eq("id", entry.comment_id);
  }

  if (typeof redirectTo === "string" && redirectTo.startsWith("/")) {
    return NextResponse.redirect(new URL(redirectTo, request.url), {
      status: 303,
    });
  }
  return NextResponse.json({ ok: true });
}
