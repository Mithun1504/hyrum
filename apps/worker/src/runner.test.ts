import { describe, expect, it } from "vitest";

describe("worker foundation", () => {
  it("does not register product job handlers in the scaffold", () => {
    expect(new Map().size).toBe(0);
  });
});
