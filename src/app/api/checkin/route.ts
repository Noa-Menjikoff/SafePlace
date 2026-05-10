import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const VALID_MOODS = ["exhausted", "tired", "neutral", "good", "great"] as const;
type Mood = (typeof VALID_MOODS)[number];

export async function POST(request: NextRequest) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const formData = await request.formData().catch(() => null);
  const mood = formData?.get("mood");

  if (
    typeof mood !== "string" ||
    !VALID_MOODS.includes(mood as Mood)
  ) {
    return NextResponse.json({ error: "invalid_mood" }, { status: 400 });
  }

  const { error } = await supabase
    .from("checkins")
    .insert({ user_id: user.id, mood });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Si l'humeur est basse, on guide vers le Mur de soutien.
  if (mood === "exhausted" || mood === "tired") {
    return NextResponse.redirect(new URL("/wall?from=checkin", request.url), {
      status: 303,
    });
  }

  return NextResponse.redirect(
    new URL("/dashboard?checkin=" + mood, request.url),
    { status: 303 }
  );
}
