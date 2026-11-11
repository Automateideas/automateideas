import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

/** Pages only for logged-out visitors. Accept-invite is not one: a signed-in user accepts there. */
const LOGGED_OUT_ONLY = new Set(["/login", "/signup"]);

/** The `?next=` path if it's a page on this site (not "//evil.com", not back to login), else the dashboard. */
function afterLogin(next: string | null) {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return "/dashboard";
  const path = next.split(/[?#]/)[0];
  return LOGGED_OUT_ONLY.has(path) ? "/dashboard" : next;
}

/**
 * A real session check for the login and sign-up pages. Asks Better Auth's own
 * endpoint, so a stale or expired cookie counts as logged out: that visitor
 * still sees the form instead of bouncing between /login and /dashboard.
 */
async function hasSession(request: NextRequest) {
  try {
    const res = await fetch(new URL("/api/auth/get-session", request.url), {
      headers: { cookie: request.headers.get("cookie") ?? "" },
      cache: "no-store",
    });
    if (!res.ok) return false;
    const body = (await res.json()) as { session?: unknown } | null;
    return Boolean(body?.session);
  } catch {
    return false; // can't tell: show the page rather than block it
  }
}

export async function proxy(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;

  // Logged in already: skip the login and sign-up pages.
  if (LOGGED_OUT_ONLY.has(pathname)) {
    if (!getSessionCookie(request) || !(await hasSession(request))) return NextResponse.next();
    return NextResponse.redirect(new URL(afterLogin(searchParams.get("next")), request.url));
  }

  // App pages. Fast, optimistic check: no session cookie means not logged in,
  // so go to /login before rendering anything. The real check happens on the
  // server in lib/viewer.ts, since a cookie can be stale or forged.
  if (getSessionCookie(request)) return NextResponse.next();

  const login = new URL("/login", request.url);
  login.searchParams.set("next", pathname + request.nextUrl.search);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: [
    "/login",
    "/signup",
    "/dashboard/:path*",
    "/team/:path*",
    "/billing/:path*",
    "/subscription/:path*",
    "/customers/:path*",
    "/sales/:path*",
    "/reports/:path*",
    "/settings/:path*",
  ],
};
