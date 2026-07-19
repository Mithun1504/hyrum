import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";

const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "form-action 'self' https://*.workos.com",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data:",
  "font-src 'self' data:",
  "connect-src 'self' https://*.workos.com",
  "worker-src 'self' blob:",
  "upgrade-insecure-requests",
].join("; ");

export function webSecurityHeaders(production = process.env.NODE_ENV === "production") {
  return [
    ...(production ? [{ key: "Content-Security-Policy", value: contentSecurityPolicy }] : []),
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
    { key: "X-Frame-Options", value: "DENY" },
  ];
}

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  output: "standalone",
  poweredByHeader: false,
  reactStrictMode: true,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: webSecurityHeaders(),
      },
    ];
  },
};

export default withSentryConfig(nextConfig, {
  silent: true,
  webpack: { treeshake: { removeDebugLogging: true } },
  sourcemaps: { deleteSourcemapsAfterUpload: true },
});
