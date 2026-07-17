import "server-only";

import { createControlPlaneClient } from "@hyrum/api-client";
import { withAuth } from "@workos-inc/authkit-nextjs";

const baseUrl = process.env.CONTROL_PLANE_URL ?? "http://localhost:4000";

export function publicControlPlaneClient() {
  return createControlPlaneClient({ baseUrl });
}

export function authenticatedControlPlaneClient(accessToken: string) {
  return createControlPlaneClient({ baseUrl, getAccessToken: async () => accessToken });
}

export async function currentControlPlaneClient() {
  const { accessToken } = await withAuth({ ensureSignedIn: true });
  return authenticatedControlPlaneClient(accessToken);
}
