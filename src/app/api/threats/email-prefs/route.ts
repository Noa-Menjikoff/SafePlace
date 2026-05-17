import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const EMAIL_MODES = ["immediate", "digest_daily", "digest_weekly", "off"] as const;
type EmailMode = (typeof EMAIL_MODES)[number];

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

  if ("alerts_email_mode" in body) {
    const v = (body as Record<string, unknown>).alerts_email_mode;
    if (typeof v !== "string" || !EMAIL_MODES.includes(v as EmailMode)) {
      return NextResponse.json(
        { error: "invalid_email_mode" },
        { status: 400 }
      );
    }
    updates.alerts_email_mode = v;
  }

  if ("alerts_min_severity" in body) {
    const v = Number((body as Record<string, unknown>).alerts_min_severity);
    if (!Number.isFinite(v) || v < 0 || v > 3) {
      return NextResponse.json(
        { error: "invalid_min_severity" },
        { status: 400 }
      );
    }
    updates.alerts_min_severity = Math.round(v);
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
