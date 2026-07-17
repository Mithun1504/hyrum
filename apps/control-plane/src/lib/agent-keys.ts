import { hkdfSync } from "node:crypto";

export function deriveAgentKey(secret: string, organizationId: string, purpose: string): string {
  return Buffer.from(
    hkdfSync(
      "sha256",
      Buffer.from(secret, "utf8"),
      Buffer.from(organizationId, "utf8"),
      Buffer.from(`hyrum-agent-key:${purpose}`, "utf8"),
      32,
    ),
  ).toString("base64url");
}
