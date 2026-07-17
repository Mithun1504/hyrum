import { authkitProxy } from "@workos-inc/authkit-nextjs";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const workosConfigured = Boolean(
  process.env.WORKOS_CLIENT_ID &&
    process.env.WORKOS_API_KEY &&
    process.env.WORKOS_COOKIE_PASSWORD &&
    process.env.NEXT_PUBLIC_WORKOS_REDIRECT_URI,
);
const localAuthBypass =
  process.env.HYRUM_E2E_AUTH_BYPASS === "1" && process.env.NODE_ENV !== "production";

export default workosConfigured
  ? authkitProxy({
      middlewareAuth: {
        enabled: true,
        unauthenticatedPaths: ["/", "/api/health", "/sign-in", "/auth/callback"],
      },
    })
  : function unconfiguredAuthProxy(request: NextRequest) {
      if (localAuthBypass && request.nextUrl.pathname.startsWith("/app")) {
        return NextResponse.next();
      }
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
