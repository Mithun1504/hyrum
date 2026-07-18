import { withAuth } from "@workos-inc/authkit-nextjs";
import { normalizeView, WorkspaceShell } from "@/components/workspace/workspace-shell";
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

  const auth = await withAuth({ ensureSignedIn: true });
  const snapshot = await getWorkspaceSnapshot(parseFilters(urlSearchParams), {
    accessToken: auth.accessToken,
  });
  const view = normalizeView(typeof params.view === "string" ? params.view : undefined);

  const actorLabel =
    [auth.user.firstName, auth.user.lastName].filter(Boolean).join(" ") || auth.user.email;

  return <WorkspaceShell snapshot={snapshot} view={view} actorLabel={actorLabel} />;
}
