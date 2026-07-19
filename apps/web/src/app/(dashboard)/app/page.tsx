import { z } from "zod";
import { normalizeView, WorkspaceShell } from "@/components/workspace/workspace-shell";
import { dashboardAuth, e2eAuthBypassEnabled } from "@/services/dashboard-auth";
import { getWorkspaceSnapshot, parseFilters } from "@/services/workspace-data";

export const dynamic = "force-dynamic";

type WorkspacePageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function WorkspacePage({ searchParams }: WorkspacePageProps) {
  const params = await searchParams;
  const urlSearchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string") urlSearchParams.set(key, value);
  }

  const view = normalizeView(typeof params.view === "string" ? params.view : undefined);
  const replayRunId = view === "replay" ? z.string().uuid().safeParse(params.run).data : undefined;
  const auth = await dashboardAuth();
  const snapshot = await getWorkspaceSnapshot(parseFilters(urlSearchParams), {
    accessToken: auth.accessToken,
    replayRunId,
  });

  const actorLabel =
    [auth.user.firstName, auth.user.lastName].filter(Boolean).join(" ") || auth.user.email;

  return (
    <WorkspaceShell
      snapshot={snapshot}
      view={view}
      actorLabel={actorLabel}
      authBypass={e2eAuthBypassEnabled()}
    />
  );
}
