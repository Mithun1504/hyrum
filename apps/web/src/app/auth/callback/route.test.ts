import { afterEach, describe, expect, it, vi } from "vitest";

const authkit = vi.hoisted(() => ({
  createOrganizationMembership: vi.fn(),
  listOrganizationMemberships: vi.fn(),
  refreshSession: vi.fn(),
}));

vi.mock("@workos-inc/authkit-nextjs", () => ({
  getWorkOS: () => ({
    userManagement: {
      createOrganizationMembership: authkit.createOrganizationMembership,
      listOrganizationMemberships: authkit.listOrganizationMemberships,
    },
  }),
  handleAuth: vi.fn(() => vi.fn()),
  refreshSession: authkit.refreshSession,
}));

import { ensureAutomaticOrganizationMembership } from "./route";

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe("automatic WorkOS organization onboarding", () => {
  it("creates a member and refreshes an organization-less session", async () => {
    vi.stubEnv("WORKOS_AUTO_JOIN_ORGANIZATION_ID", "org_demo");
    authkit.listOrganizationMemberships.mockResolvedValue({ data: [] });

    await ensureAutomaticOrganizationMembership({ user: { id: "user_new" } });

    expect(authkit.createOrganizationMembership).toHaveBeenCalledWith({
      organizationId: "org_demo",
      userId: "user_new",
      roleSlug: "member",
    });
    expect(authkit.refreshSession).toHaveBeenCalledWith({
      organizationId: "org_demo",
      ensureSignedIn: true,
    });
  });

  it("leaves an organization-scoped session unchanged", async () => {
    await ensureAutomaticOrganizationMembership({
      organizationId: "org_existing",
      user: { id: "user_existing" },
    });

    expect(authkit.listOrganizationMemberships).not.toHaveBeenCalled();
    expect(authkit.createOrganizationMembership).not.toHaveBeenCalled();
    expect(authkit.refreshSession).not.toHaveBeenCalled();
  });

  it("refreshes without duplicating an existing automatic membership", async () => {
    vi.stubEnv("WORKOS_AUTO_JOIN_ORGANIZATION_ID", "org_demo");
    authkit.listOrganizationMemberships.mockResolvedValue({
      data: [{ organizationId: "org_demo", status: "active" }],
    });

    await ensureAutomaticOrganizationMembership({ user: { id: "user_existing" } });

    expect(authkit.createOrganizationMembership).not.toHaveBeenCalled();
    expect(authkit.refreshSession).toHaveBeenCalledWith({
      organizationId: "org_demo",
      ensureSignedIn: true,
    });
  });
});
