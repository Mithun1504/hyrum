import { redirect } from "next/navigation";
import { getWorkspace } from "@/services/workspace";

export default async function WorkspacePage() {
  const { services } = await getWorkspace();
  const firstService = services[0];
  redirect(
    firstService
      ? firstService.status === "onboarding"
        ? "/app/onboarding"
        : `/app/${firstService.slug}/overview`
      : "/app/onboarding/service",
  );
}
