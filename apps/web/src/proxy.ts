import { authkitProxy } from "@workos-inc/authkit-nextjs";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const workosConfigured = Boolean(
  process.env.WORKOS_CLIENT_ID &&
    process.env.WORKOS_API_KEY &&
    process.env.WORKOS_COOKIE_PASSWORD &&
    process.env.NEXT_PUBLIC_WORKOS_REDIRECT_URI,
);
const e2eBypass =
  process.env.NODE_ENV !== "production" && process.env.HYRUM_E2E_AUTH_BYPASS === "1";
export default workosConfigured
  ? authkitProxy({
      middlewareAuth: {
        enabled: true,
        unauthenticatedPaths: [
          "/",
          "/api/health",
          "/sign-in",
          "/auth/callback",
          "/icon",
          "/opengraph-image",
          "/robots.txt",
          "/sitemap.xml",
        ],
      },
    })
  : e2eBypass
    ? function e2eAuthProxy() {
        return NextResponse.next();
      }
    : function unconfiguredAuthProxy(request: NextRequest) {
        const protectedPath =
          request.nextUrl.pathname.startsWith("/app") ||
          request.nextUrl.pathname.startsWith("/sign-in") ||
          request.nextUrl.pathname.startsWith("/auth/callback");
        if (protectedPath) {
          return NextResponse.json(
            {
              title: "Authentication unavailable",
              status: 503,
              detail: "WorkOS AuthKit is not configured",
            },
            { status: 503 },
          );
        }
        return NextResponse.next();
      };

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
