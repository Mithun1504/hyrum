import { z } from "zod";

const serviceCursorSchema = z.object({
  createdAt: z.iso.datetime(),
  id: z.uuid(),
});

const ledgerCursorSchema = z.object({
  lastObservedAt: z.iso.datetime(),
  id: z.uuid(),
});

export function encodeServiceCursor(cursor: { createdAt: Date; id: string }): string {
  return Buffer.from(
    JSON.stringify({ createdAt: cursor.createdAt.toISOString(), id: cursor.id }),
  ).toString("base64url");
}

export function decodeServiceCursor(value: string | undefined) {
  if (!value) return undefined;
  try {
    const decoded: unknown = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    const parsed = serviceCursorSchema.parse(decoded);
    return { createdAt: new Date(parsed.createdAt), id: parsed.id };
  } catch {
    throw new TypeError("Invalid pagination cursor");
  }
}

export function encodeLedgerCursor(cursor: { lastObservedAt: Date; id: string }): string {
  return Buffer.from(
    JSON.stringify({ lastObservedAt: cursor.lastObservedAt.toISOString(), id: cursor.id }),
  ).toString("base64url");
}

export function decodeLedgerCursor(value: string | undefined) {
  if (!value) return undefined;
  try {
    const decoded: unknown = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    const parsed = ledgerCursorSchema.parse(decoded);
    return { lastObservedAt: new Date(parsed.lastObservedAt), id: parsed.id };
  } catch {
    throw new TypeError("Invalid pagination cursor");
  }
}
