import { describe, expect, it } from "vitest";
import { workerDatabaseUrl } from "./config";

describe("workerDatabaseUrl", () => {
  it("requires distinct worker credentials in production", () => {
    const shared = "postgresql://app:secret@db/hyrum";
    expect(() => workerDatabaseUrl({ NODE_ENV: "production", DATABASE_URL: shared })).toThrow(
      /WORKER_DATABASE_URL is required/,
    );
    expect(() =>
      workerDatabaseUrl({
        NODE_ENV: "production",
        DATABASE_URL: shared,
        WORKER_DATABASE_URL: "postgresql://app:other-secret@db/hyrum",
      }),
    ).toThrow(/distinct/);
    expect(
      workerDatabaseUrl({
        NODE_ENV: "production",
        DATABASE_URL: shared,
        WORKER_DATABASE_URL: "postgresql://worker:secret@db/hyrum",
      }),
    ).toContain("worker");
  });
});
