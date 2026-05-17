import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

const PROTECTED_PREFIXES = [
  "/dashboard",
  "/feed",
  "/wall",
  "/reply",
  "/stats",
  "/security",
  "/ideas",
  "/settings",
];

const PRO_PREFIXES = ["/reply", "/stats", "/ideas"];
const SHIELD_PREFIXES = ["/security"];

const PUBLIC_AUTH_ROUTES = ["/login"];

export async function middleware(request: NextRequest) {
  const { response, user, supabase } = await updateSession(request);
  const { pathname } = request.nextUrl;

  const isProtected = PROTECTED_PREFIXES.some((p) => pathname.startsWith(p));
  const isAuthRoute = PUBLIC_AUTH_ROUTES.some((p) => pathname.startsWith(p));

  if (isProtected && !user) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (isAuthRoute && user) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  // Gate par plan : on lit profile.plan une fois si nécessaire.
  const isProRoute = PRO_PREFIXES.some((p) => pathname.startsWith(p));
  const isShieldRoute = SHIELD_PREFIXES.some((p) => pathname.startsWith(p));

  if (user && (isProRoute || isShieldRoute)) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("plan")
      .eq("id", user.id)
      .maybeSingle();

    const plan = profile?.plan as "free" | "pro" | "shield" | undefined;

    if (isShieldRoute && plan !== "shield") {
      return NextResponse.redirect(
        new URL("/settings?upgrade=shield", request.url)
      );
    }
    if (isProRoute && plan !== "pro" && plan !== "shield") {
      return NextResponse.redirect(new URL("/settings?upgrade=1", request.url));
    }
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static, _next/image
     * - favicon, images, public files
     * - api routes (handled separately)
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
