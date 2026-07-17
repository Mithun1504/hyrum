import "server-only";

import { withAuth } from "@workos-inc/authkit-nextjs";
import { cache } from "react";
import { authenticatedControlPlaneClient } from "./control-plane";

export const getWorkspace = cache(async () => {
  const { user, accessToken } = await withAuth({ ensureSignedIn: true });
  const client = authenticatedControlPlaneClient(accessToken);
  const [session, organization, services, notifications] = await Promise.all([
    client.session(),
    client.organization(),
    client.services({ limit: 50 }),
    client.notifications(),
  ]);

  return { user, session, organization, services: services.data, notifications };
});
