import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE_NAME = "sl_session";
const SESSION_COOKIE_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;
const PUBLIC_PATH_PREFIXES = ["/login", "/setup", "/_next", "/favicon", "/catalog-icons"];

/**
 * A cheap first gate: requests without a session cookie go to `/login`. It only checks that the
 * cookie exists; `requireSession` validates it on the server for every page, action and stream.
 * Page requests also re-issue the cookie for another 7 days, matching the sliding expiry that
 * `validateSession` keeps in the database (an invalid token gains nothing: the server rejects it).
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (PUBLIC_PATH_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) return NextResponse.next();
  const sessionToken = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (sessionToken) {
    const response = NextResponse.next();
    if (!pathname.startsWith("/api/")) {
      const isSecure = process.env.COOKIE_SECURE ? process.env.COOKIE_SECURE !== "false" : process.env.NODE_ENV === "production";
      response.cookies.set(SESSION_COOKIE_NAME, sessionToken, { httpOnly: true, secure: isSecure, sameSite: "strict", path: "/", maxAge: SESSION_COOKIE_MAX_AGE_SECONDS });
    }
    return response;
  }
  if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", `${pathname}${search}`);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
