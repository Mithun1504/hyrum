export function productRole(workosRole: string): "owner" | "admin" | "engineer" | "viewer" {
  if (workosRole === "owner") return "owner";
  if (workosRole === "admin") return "admin";
  if (workosRole === "engineer" || workosRole === "member") return "engineer";
  return "viewer";
}

export function workspaceSlug(name: string, workosOrganizationId: string): string {
  const base = name
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  const suffix = workosOrganizationId
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(-10)
    .toLowerCase();
  return `${base || "workspace"}-${suffix}`;
}
