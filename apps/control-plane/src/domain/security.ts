import { createHash, createPublicKey, timingSafeEqual, verify } from "node:crypto";
import { hash as argonHash, verify as argonVerify } from "@node-rs/argon2";

export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
    a.localeCompare(b),
  );
  return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`).join(",")}}`;
}

export function sha256Hex(value: unknown): string {
  return createHash("sha256").update(stableStringify(value)).digest("hex");
}

const machineTokenHashOptions = {
  algorithm: 2,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} satisfies NonNullable<Parameters<typeof argonHash>[1]>;

function legacySha256MachineTokenHash(token: string): string {
  return `sha256:${createHash("sha256").update(token).digest("hex")}`;
}

export async function hashMachineToken(token: string): Promise<string> {
  return argonHash(token, machineTokenHashOptions);
}

export function machineTokenPrefix(token: string): string | undefined {
  return /^hyrum_([A-Za-z0-9]{8,64})_[A-Za-z0-9_-]{16,}$/.exec(token)?.[1];
}

export function constantTimeTokenEqual(candidate: string, stored: string): boolean {
  const left = Buffer.from(candidate);
  const right = Buffer.from(stored);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function verifyMachineToken(token: string, storedHash: string): Promise<boolean> {
  if (storedHash.startsWith("$argon2id$")) return argonVerify(storedHash, token);
  if (storedHash.startsWith("sha256:")) {
    return constantTimeTokenEqual(legacySha256MachineTokenHash(token), storedHash);
  }
  return false;
}

export function machineTokenHashNeedsRotation(storedHash: string): boolean {
  return storedHash.startsWith("sha256:");
}

export function verifyEd25519Payload(
  payload: unknown,
  signature: string,
  publicKeyPem: string,
): boolean {
  const signatureBytes = Buffer.from(signature, "base64");
  if (signatureBytes.length === 0) return false;
  return verify(
    null,
    Buffer.from(stableStringify(payload)),
    createPublicKey(publicKeyPem),
    signatureBytes,
  );
}
