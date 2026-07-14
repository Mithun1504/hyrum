import { createControlPlaneClient } from "@hyrum/api-client";

export const controlPlane = createControlPlaneClient({
  baseUrl: process.env.NEXT_PUBLIC_CONTROL_PLANE_URL ?? "http://localhost:4000",
});
