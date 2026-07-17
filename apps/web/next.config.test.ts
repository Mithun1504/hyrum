import { describe, expect, it } from "vitest";
import { webSecurityHeaders } from "./next.config";

describe("web security headers", () => {
  it("enables an AuthKit-compatible CSP only in production", () => {
    const production = webSecurityHeaders(true);
    const csp = production.find((header) => header.key === "Content-Security-Policy")?.value;

    expect(csp).toContain("script-src 'self' 'unsafe-inline'");
    expect(csp).toContain("connect-src 'self' https://*.workos.com");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(webSecurityHeaders(false)).not.toContainEqual(
      expect.objectContaining({ key: "Content-Security-Policy" }),
    );
  });
});
