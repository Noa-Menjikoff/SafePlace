import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const MAX_NOTE_LENGTH = 2000;

/**
 * Met à jour la note privée d'un profil stalker (champ libre, visible
 * uniquement par le créateur). Note = "" supprime la note.
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

  const body = await request.json().catch(() => null);
  const note = body && typeof body === "object" ? (body as Record<string, unknown>).note : null;

  if (typeof note !== "string") {
    return NextResponse.json({ error: "invalid_note" }, { status: 400 });
  }

  const trimmed = note.slice(0, MAX_NOTE_LENGTH);

  const { data: stalker } = await supabase
    .from("stalker_profiles")
    .select("id, channel_id")
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
  const { error } = await admin
    .from("stalker_profiles")
    .update({
      notes: trimmed.length > 0 ? trimmed : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", stalker.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
