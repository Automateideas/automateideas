import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

// Fast, optimistic check: no session cookie means not logged in, so go to
// /login before rendering anything. The real check happens on the server in
// lib/viewer.ts, since a cookie can be stale or forged.
export function proxy(request: NextRequest) {
  if (getSessionCookie(request)) return NextResponse.next();

  const login = new URL("/login", request.url);
  login.searchParams.set("next", request.nextUrl.pathname + request.nextUrl.search);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: [
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
