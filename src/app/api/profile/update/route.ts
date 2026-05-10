import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { FILTER_MODES, type FilterMode } from "@/lib/filter-mode";

export const dynamic = "force-dynamic";

const VALID_LANGUAGES = ["fr", "en"] as const;

export async function POST(request: NextRequest) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};

  if ("filter_mode" in body) {
    const v = (body as Record<string, unknown>).filter_mode;
    if (typeof v !== "string" || !FILTER_MODES.includes(v as FilterMode)) {
      return NextResponse.json(
        { error: "invalid_filter_mode" },
        { status: 400 }
      );
    }
    updates.filter_mode = v;
  }

  if ("metric_shield" in body) {
    updates.metric_shield = Boolean(
      (body as Record<string, unknown>).metric_shield
    );
  }

  if ("language" in body) {
    const v = (body as Record<string, unknown>).language;
    if (
      typeof v !== "string" ||
      !VALID_LANGUAGES.includes(v as (typeof VALID_LANGUAGES)[number])
    ) {
      return NextResponse.json(
        { error: "invalid_language" },
        { status: 400 }
      );
    }
    updates.language = v;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "no_fields" }, { status: 400 });
  }

  const { error } = await supabase
    .from("profiles")
    .update(updates)
    .eq("id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
