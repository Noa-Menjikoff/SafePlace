import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Marque une alerte comme dismissée. RLS sur threat_alerts (auth.uid =
 * user_id) protège déjà l'opération — pas besoin de service role.
 */
export async function POST(request: NextRequest) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const formData = await request.formData().catch(() => null);
  const alertId = formData?.get("alertId");
  const redirectTo = formData?.get("redirectTo");

  if (typeof alertId !== "string") {
    return NextResponse.json({ error: "missing_alert_id" }, { status: 400 });
  }

  const { error } = await supabase
    .from("threat_alerts")
    .update({ dismissed: true })
    .eq("id", alertId)
    .eq("user_id", user.id);

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
