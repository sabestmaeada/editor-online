import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE_NAME = "__session";

export function proxy(req: NextRequest) {
  const hasSession = Boolean(req.cookies.get(SESSION_COOKIE_NAME)?.value);
  const { pathname } = req.nextUrl;

  const isProtected =
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/editor") ||
    pathname.startsWith("/admin") ||
    pathname.startsWith("/projects");

  if (isProtected && !hasSession) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (pathname === "/login" && hasSession) {
    // If the user was bounced here from a protected page (with ?next=), their
    // session cookie is likely STALE — Firebase revoked the session (e.g. after
    // password change). Don't auto-redirect back to /dashboard or it loops
    // forever. Let the login page handle it; a successful login will replace
    // the stale cookie with a fresh one.
    const hasNext = req.nextUrl.searchParams.has("next");
    if (!hasNext) {
      const url = req.nextUrl.clone();
      url.pathname = "/dashboard";
      url.search = "";
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/editor/:path*",
    "/admin/:path*",
    "/projects/:path*",
    "/login",
  ],
};
