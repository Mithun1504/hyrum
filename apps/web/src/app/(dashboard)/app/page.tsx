import { withAuth } from "@workos-inc/authkit-nextjs";
import { normalizeView, WorkspaceShell } from "@/components/workspace/workspace-shell";
import { isDemoDataEnabled } from "@/services/control-plane";
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

  const demoMode = isDemoDataEnabled();
  const auth = demoMode ? null : await withAuth({ ensureSignedIn: true });
  const snapshot = await getWorkspaceSnapshot(parseFilters(urlSearchParams), {
    accessToken: auth?.accessToken,
    demoMode,
  });
  const view = normalizeView(typeof params.view === "string" ? params.view : undefined);

  const actorLabel = auth?.user
    ? [auth.user.firstName, auth.user.lastName].filter(Boolean).join(" ") || auth.user.email
    : "Demo user";

  return <WorkspaceShell snapshot={snapshot} view={view} actorLabel={actorLabel} />;
}
