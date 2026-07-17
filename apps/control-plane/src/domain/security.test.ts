import { generateKeyPairSync, sign } from "node:crypto";
import { describe, expect, it } from "vitest";
import vector from "../../../../internal/report/testdata/signature-vector.json" with {
  type: "json",
};
import {
  constantTimeTokenEqual,
  hashMachineToken,
  machineTokenHashNeedsRotation,
  machineTokenPrefix,
  stableStringify,
  verifyEd25519Payload,
  verifyMachineToken,
} from "./security";

describe("machine and report security helpers", () => {
  it("extracts and verifies high-entropy machine tokens with Argon2id", async () => {
    const token = "hyrum_abc123XYZ_deadbeefdeadbeefdeadbeef";
    expect(machineTokenPrefix(token)).toBe("abc123XYZ");
    const hash = await hashMachineToken(token);
    expect(hash).toContain("$argon2id$");
    expect(machineTokenHashNeedsRotation(hash)).toBe(false);
    expect(await verifyMachineToken(token, hash)).toBe(true);
    expect(await verifyMachineToken(`${token}x`, hash)).toBe(false);
  });

  it("keeps a transitional verifier for existing sha256 token hashes", async () => {
    const token = "hyrum_abc123XYZ_deadbeefdeadbeefdeadbeef";
    const legacyHash = "sha256:d9c479d9799a162127f397b817c268e1b9f14ef0237c526282a7a1bd1e22a615";
    expect(machineTokenHashNeedsRotation(legacyHash)).toBe(true);
    expect(await verifyMachineToken(token, legacyHash)).toBe(true);
    expect(await verifyMachineToken(`${token}x`, legacyHash)).toBe(false);
    expect(constantTimeTokenEqual(legacyHash, legacyHash)).toBe(true);
  });

  it("canonicalizes signed report payloads independent of object key order", () => {
    expect(stableStringify({ b: 2, a: 1 })).toBe(stableStringify({ a: 1, b: 2 }));
  });

  it("verifies Ed25519 report signatures over canonical JSON", () => {
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    const payload = { version: "1", organization_id: "org", results: [{ b: 2, a: 1 }] };
    const signature = sign(null, Buffer.from(stableStringify(payload)), privateKey).toString(
      "base64",
    );
    expect(
      verifyEd25519Payload(
        payload,
        signature,
        publicKey.export({ type: "spki", format: "pem" }).toString(),
      ),
    ).toBe(true);
    expect(
      verifyEd25519Payload(
        { ...payload, version: "2" },
        signature,
        publicKey.export({ type: "spki", format: "pem" }).toString(),
      ),
    ).toBe(false);
  });

  it("verifies the Go canonical-signature golden vector", () => {
    expect(stableStringify(vector.payload)).toBe(vector.canonical);
    expect(
      verifyEd25519Payload(vector.payload, vector.signature_base64url, vector.public_key_pem),
    ).toBe(true);
  });
});
