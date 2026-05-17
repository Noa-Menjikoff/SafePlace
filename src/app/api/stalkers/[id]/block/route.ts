import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * Toggle le flag `blocked` d'un profil stalker. Quand bloqué, tous les
 * commentaires existants de cet auteur sur la chaîne sont aussi marqués
 * `is_hidden = true` (le déblocage ne réaffiche PAS — l'utilisateur peut
 * gérer la visibilité au cas par cas dans le Clean Feed).
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
  const action = formData?.get("action") ?? "block"; // "block" | "unblock"
  const redirectTo = formData?.get("redirectTo");
  const blocked = action !== "unblock";

  // Vérifie l'ownership via les channels du user.
  const { data: stalker } = await supabase
    .from("stalker_profiles")
    .select("id, channel_id, platform_author_id")
    .eq("id", params.id)
    .maybeSingle();

  if (!stalker) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const { data: ownsChannel } = await supabase
    .from("channels")
    .select("id")
    .eq("id", stalker.channel_id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!ownsChannel) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const admin = createSupabaseAdminClient();

  const { error: blockError } = await admin
    .from("stalker_profiles")
    .update({ blocked, updated_at: new Date().toISOString() })
    .eq("id", stalker.id);

  if (blockError) {
    return NextResponse.json({ error: blockError.message }, { status: 500 });
  }

  // Side-effect : masquer tous les commentaires existants de cet auteur.
  if (blocked) {
    await admin
      .from("comments")
      .update({ is_hidden: true })
      .eq("channel_id", stalker.channel_id)
      .eq("platform_author_id", stalker.platform_author_id);
  }

  if (typeof redirectTo === "string" && redirectTo.startsWith("/")) {
    return NextResponse.redirect(new URL(redirectTo, request.url), {
      status: 303,
    });
  }

  return NextResponse.json({ ok: true, blocked });
}
