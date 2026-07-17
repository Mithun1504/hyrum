import { describe, expect, it } from "vitest";
import { inviteMemberRequestSchema, updateMemberRoleRequestSchema } from "./members";

describe("member management contracts", () => {
  it("does not allow owner assignment through ordinary role changes", () => {
    expect(updateMemberRoleRequestSchema.safeParse({ role: "owner" }).success).toBe(false);
    expect(
      inviteMemberRequestSchema.safeParse({ email: "owner@example.test", role: "owner" }).success,
    ).toBe(false);
  });

  it("bounds invitation lifetime", () => {
    expect(
      inviteMemberRequestSchema.parse({ email: "engineer@example.test", role: "engineer" }),
    ).toMatchObject({ expiresInDays: 7 });
    expect(
      inviteMemberRequestSchema.safeParse({
        email: "engineer@example.test",
        role: "engineer",
        expiresInDays: 31,
      }).success,
    ).toBe(false);
  });
});
