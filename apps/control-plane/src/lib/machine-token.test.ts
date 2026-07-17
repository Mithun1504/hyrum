import { describe, expect, it } from "vitest";
import { issueMachineToken, machineTokenPrefix, verifyMachineToken } from "./machine-token";

describe("machine credentials", () => {
  it("issues an opaque prefixed token and verifies only with the server pepper", async () => {
    const pepper = "test-pepper-that-is-at-least-thirty-two-bytes-long";
    const issued = await issueMachineToken(pepper);
    expect(machineTokenPrefix(issued.token)).toBe(issued.tokenPrefix);
    await expect(verifyMachineToken(issued.tokenHash, issued.token, pepper)).resolves.toBe(true);
    await expect(
      verifyMachineToken(
        issued.tokenHash,
        issued.token,
        "different-pepper-that-is-also-at-least-thirty-two-bytes",
      ),
    ).resolves.toBe(false);
    expect(issued.tokenHash).not.toContain(issued.token);
  });
});
