import { NextResponse, type NextRequest } from "next/server";
import crypto from "node:crypto";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { buildYoutubeAuthUrl } from "@/lib/youtube";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const nonce = crypto.randomBytes(16).toString("hex");
  const state = `${user.id}:${nonce}`;

  const authUrl = buildYoutubeAuthUrl(state);
  const response = NextResponse.redirect(authUrl);
  response.cookies.set("yt_oauth_state", nonce, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 600,
    path: "/",
  });
  return response;
}
