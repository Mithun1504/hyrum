import { getTableName } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { jobs, organizations } from "./schema";

describe("database schema", () => {
  it("keeps tenant and job foundations in explicit tables", () => {
    expect(getTableName(organizations)).toBe("organizations");
    expect(getTableName(jobs)).toBe("jobs");
  });
});
