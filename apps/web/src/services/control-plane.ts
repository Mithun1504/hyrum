import { createControlPlaneClient } from "@hyrum/api-client";

export const controlPlaneBaseUrl =
  process.env.CONTROL_PLANE_URL ??
  process.env.NEXT_PUBLIC_CONTROL_PLANE_URL ??
  "http://localhost:4000";

export function createControlPlane(accessToken?: string) {
  return createControlPlaneClient({
    baseUrl: controlPlaneBaseUrl,
    getAccessToken: async () => accessToken,
    fetch: (input, init) =>
      fetch(input, {
        ...init,
        cache: "no-store",
        signal: init?.signal ?? AbortSignal.timeout(3_000),
      }),
  });
}
