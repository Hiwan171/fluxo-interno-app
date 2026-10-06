import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const SESSION_COOKIE_NAME = "fluxo_session";
const PUBLIC_ROUTES = new Set(["/login"]);
// `/definir-senha/` é alcançada por quem ainda não tem sessão: é o link de
// convite e o de redefinição. A validade do token é conferida na própria página.
const PUBLIC_PREFIXES = ["/f/", "/definir-senha/"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSessionCookie = Boolean(
    request.cookies.get(SESSION_COOKIE_NAME)?.value,
  );
  const isPublicRoute =
    PUBLIC_ROUTES.has(pathname) ||
    PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));

  if (!isPublicRoute && !hasSessionCookie) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (PUBLIC_ROUTES.has(pathname) && hasSessionCookie) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|.*\\.(?:png|svg|ico)$).*)"],
};
