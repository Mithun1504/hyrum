import { redirect } from "next/navigation";
import { currentControlPlaneClient } from "@/services/control-plane";

export default async function SlackOAuthCallbackPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<{ code?: string; state?: string; error?: string }>;
}>) {
  const { code, state, error } = await searchParams;
  if (error || !code || !state) {
    redirect(
      `/app/settings/integrations?slack_error=${encodeURIComponent(error ?? "missing_callback")}`,
    );
  }
  await (await currentControlPlaneClient()).completeSlackOAuth({ code, state });
  redirect("/app/settings/integrations?slack=connected");
}
