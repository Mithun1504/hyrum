import { getWorkOS, handleAuth, refreshSession } from "@workos-inc/authkit-nextjs";

type AuthenticationContext = {
  organizationId?: string;
  user: { id: string };
};

export async function ensureAutomaticOrganizationMembership({
  organizationId,
  user,
}: AuthenticationContext) {
  if (organizationId) return;

  const automaticOrganizationId = process.env.WORKOS_AUTO_JOIN_ORGANIZATION_ID;
  if (!automaticOrganizationId) {
    throw new Error("WorkOS automatic organization onboarding is not configured");
  }

  const workos = getWorkOS();
  const memberships = await workos.userManagement.listOrganizationMemberships({
    userId: user.id,
    statuses: ["active", "inactive", "pending"],
    limit: 100,
  });
  const automaticMembership = memberships.data.find(
    (membership) => membership.organizationId === automaticOrganizationId,
  );

  if (automaticMembership?.status !== "active") {
    await workos.userManagement.createOrganizationMembership({
      organizationId: automaticOrganizationId,
      userId: user.id,
      roleSlug: "member",
    });
  }

  await refreshSession({ organizationId: automaticOrganizationId, ensureSignedIn: true });
}

export const GET = handleAuth({
  returnPathname: "/app",
  onSuccess: ensureAutomaticOrganizationMembership,
});
