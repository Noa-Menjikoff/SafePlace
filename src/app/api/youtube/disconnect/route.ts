import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { decrypt } from "@/lib/crypto";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(new URL("/login", request.url), {
      status: 303,
    });
  }

  const formData = await request.formData().catch(() => null);
  const channelId = formData?.get("channelId");

  const query = supabase
    .from("channels")
    .select("id, refresh_token, access_token")
    .eq("user_id", user.id);

  const { data: channels } = typeof channelId === "string"
    ? await query.eq("id", channelId)
    : await query;

  for (const channel of channels ?? []) {
    const tokenToRevoke = channel.refresh_token || channel.access_token;
    if (tokenToRevoke) {
      try {
        const decrypted = decrypt(tokenToRevoke);
        await fetch(
          `https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(
            decrypted
          )}`,
          { method: "POST" }
        );
      } catch (e) {
        console.error("Token revoke failed", e);
      }
    }
  }

  if (typeof channelId === "string") {
    await supabase.from("channels").delete().eq("user_id", user.id).eq("id", channelId);
  } else {
    await supabase.from("channels").delete().eq("user_id", user.id);
  }

  return NextResponse.redirect(new URL("/settings?yt=disconnected", request.url), {
    status: 303,
  });
}
