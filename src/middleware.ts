import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { ADMIN_COOKIE, adminAuthorized, adminConfig, requestNeedsAdmin } from "@/lib/admin-session";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (!requestNeedsAdmin(pathname, request.method)) return NextResponse.next();

  const config = adminConfig();
  const token = request.cookies.get(ADMIN_COOKIE)?.value;
  if (config.state === "ready" && (await adminAuthorized(token))) {
    const response = NextResponse.next();
    response.headers.set("Cache-Control", "no-store");
    return response;
  }

  if (pathname.startsWith("/api/")) {
    const status = config.state === "ready" ? 401 : 503;
    const error = config.state === "ready" ? "unauthorized" : "admin_locked";
    const message = config.state === "ready" ? "Sign in to the shop admin." : config.message;
    return NextResponse.json({ error, message }, { status, headers: { "Cache-Control": "no-store" } });
  }

  const login = request.nextUrl.clone();
  login.pathname = "/login";
  login.search = "";
  login.searchParams.set("next", pathname);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ["/dashboard", "/dashboard/:path*", "/api/shop", "/api/orders", "/api/orders/:path*"],
};
