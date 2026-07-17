import { describe, expect, it } from "vitest";
import { identityOrganizationListSchema, permissionsForRole, roleHasPermission } from "./auth";

describe("organization role permissions", () => {
  it("keeps viewers read-only", () => {
    expect(roleHasPermission("viewer", "ledger:read")).toBe(true);
    expect(roleHasPermission("viewer", "assertion:manage")).toBe(false);
    expect(roleHasPermission("viewer", "integration:manage")).toBe(false);
  });

  it("allows engineers to review evidence without managing policy", () => {
    expect(roleHasPermission("engineer", "claim:review")).toBe(true);
    expect(roleHasPermission("engineer", "replay:run")).toBe(true);
    expect(roleHasPermission("engineer", "policy:manage")).toBe(false);
  });

  it("reserves tenant lifecycle actions for owners", () => {
    expect(roleHasPermission("admin", "organization:delete")).toBe(false);
    expect(roleHasPermission("owner", "organization:delete")).toBe(true);
    expect(roleHasPermission("owner", "organization:transfer")).toBe(true);
    expect(new Set(permissionsForRole("owner")).size).toBe(permissionsForRole("owner").length);
  });

  it("validates organization choices without exposing user profile data", () => {
    expect(
      identityOrganizationListSchema.parse({
        data: [
          {
            organizationId: "019f6274-8db5-7313-b96e-9d721f04f3d7",
            workosOrganizationId: "org_01JTEST",
            membershipId: "019f6274-b573-71a0-b6ad-218a45f825dc",
            slug: "acme-org01jtest",
            name: "Acme",
            status: "active",
            role: "engineer",
          },
        ],
      }).data,
    ).toHaveLength(1);
  });
});
