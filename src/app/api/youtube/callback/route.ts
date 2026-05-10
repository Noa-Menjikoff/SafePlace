import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { encrypt } from "@/lib/crypto";
import { exchangeCodeForTokens, fetchMineChannel } from "@/lib/youtube";

export const dynamic = "force-dynamic";

function settingsRedirect(request: NextRequest, params: Record<string, string>) {
  const url = new URL("/settings", request.url);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return NextResponse.redirect(url);
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const oauthError = searchParams.get("error");

  if (oauthError) {
    return settingsRedirect(request, { yt: "error", reason: oauthError });
  }
  if (!code || !state) {
    return settingsRedirect(request, { yt: "error", reason: "missing_params" });
  }

  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const [stateUserId, stateNonce] = state.split(":");
  const cookieNonce = request.cookies.get("yt_oauth_state")?.value;

  if (
    !stateUserId ||
    !stateNonce ||
    stateUserId !== user.id ||
    stateNonce !== cookieNonce
  ) {
    return settingsRedirect(request, { yt: "error", reason: "state_mismatch" });
  }

  let tokens;
  try {
    tokens = await exchangeCodeForTokens(code);
  } catch (e) {
    console.error("YouTube token exchange failed", e);
    return settingsRedirect(request, { yt: "error", reason: "token_exchange" });
  }

  let channel;
  try {
    channel = await fetchMineChannel(tokens.access_token);
  } catch (e) {
    console.error("YouTube channel fetch failed", e);
    return settingsRedirect(request, { yt: "error", reason: "channel_fetch" });
  }

  if (!channel) {
    return settingsRedirect(request, { yt: "error", reason: "no_channel" });
  }

  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);

  const { error: dbError } = await supabase
    .from("channels")
    .upsert(
      {
        user_id: user.id,
        platform: "youtube",
        platform_id: channel.id,
        name: channel.title,
        thumbnail_url: channel.thumbnailUrl,
        access_token: encrypt(tokens.access_token),
        refresh_token: tokens.refresh_token
          ? encrypt(tokens.refresh_token)
          : null,
        token_expires_at: expiresAt.toISOString(),
        subscriber_count: channel.subscriberCount,
      },
      { onConflict: "user_id,platform_id" }
    );

  if (dbError) {
    console.error("Channel upsert failed", dbError);
    return settingsRedirect(request, { yt: "error", reason: "db" });
  }

  const response = settingsRedirect(request, { yt: "connected" });
  response.cookies.delete("yt_oauth_state");
  return response;
}
