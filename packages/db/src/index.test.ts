import { PgDialect } from "drizzle-orm/pg-core";
import type { Sql } from "postgres";
import { describe, expect, it, vi } from "vitest";
import { assertSafeDatabasePrincipal, receiptIsUnexpired } from "./index";

describe("assertSafeDatabasePrincipal", () => {
  it("rejects production principals that bypass row-level security", async () => {
    const superuser = vi
      .fn()
      .mockResolvedValue([
        { role_name: "postgres", rolsuper: true, rolbypassrls: true },
      ]) as unknown as Sql;
    const bypass = vi
      .fn()
      .mockResolvedValue([
        { role_name: "unsafe", rolsuper: false, rolbypassrls: true },
      ]) as unknown as Sql;

    await expect(assertSafeDatabasePrincipal(superuser, true)).rejects.toThrow(/NOSUPERUSER/);
    await expect(assertSafeDatabasePrincipal(bypass, true)).rejects.toThrow(/NOBYPASSRLS/);
  });

  it("accepts a constrained production principal and skips the check outside production", async () => {
    const safe = vi
      .fn()
      .mockResolvedValue([
        { role_name: "hyrum_app", rolsuper: false, rolbypassrls: false },
      ]) as unknown as Sql;
    const development = vi.fn() as unknown as Sql;

    await expect(assertSafeDatabasePrincipal(safe, true)).resolves.toBeUndefined();
    await expect(assertSafeDatabasePrincipal(development, false)).resolves.toBeUndefined();
    expect(development).not.toHaveBeenCalled();
  });
});

describe("receiptIsUnexpired", () => {
  it("requires receipt expiry to be later than now", () => {
    const now = new Date("2026-07-15T10:00:00.000Z");
    const query = new PgDialect().sqlToQuery(receiptIsUnexpired(now).getSQL());

    expect(query.sql).toContain('"receipts"."expires_at" > $1');
    expect(query.params).toEqual([now.toISOString()]);
  });
});
