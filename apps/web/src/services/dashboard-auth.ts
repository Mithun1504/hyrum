import { withAuth } from "@workos-inc/authkit-nextjs";

export function e2eAuthBypassEnabled() {
  return process.env.NODE_ENV !== "production" && process.env.HYRUM_E2E_AUTH_BYPASS === "1";
}

export async function dashboardAuth() {
  if (e2eAuthBypassEnabled()) {
    return {
      accessToken: "hyrum-e2e-access-token",
      user: {
        id: "user_e2e",
        email: "engineer@hyrum.test",
        firstName: "E2E",
        lastName: "Engineer",
      },
    };
  }
  return withAuth({ ensureSignedIn: true });
}
