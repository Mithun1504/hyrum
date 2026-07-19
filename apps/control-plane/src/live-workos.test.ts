import { WorkOS } from "@workos-inc/node";
import { describe, expect, it } from "vitest";

describe.skipIf(process.env.HYRUM_RUN_LIVE_WORKOS !== "1")("live WorkOS membership", () => {
  it("finds the configured user in the configured organization", async () => {
    const workos = new WorkOS(required("WORKOS_API_KEY"), {
      clientId: required("WORKOS_CLIENT_ID"),
    });
    const memberships = await workos.userManagement.listOrganizationMemberships({
      organizationId: required("HYRUM_LIVE_WORKOS_ORGANIZATION_ID"),
      userId: required("HYRUM_LIVE_WORKOS_USER_ID"),
      statuses: ["active"],
    });
    expect(memberships.data.length).toBeGreaterThan(0);
  });
});

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required for the WorkOS live test`);
  return value;
}
