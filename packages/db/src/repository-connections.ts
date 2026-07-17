import type { CreateRepositoryConnection } from "@hyrum/contracts";
import { and, desc, eq, isNull } from "drizzle-orm";
import type { Database } from "./index";
import {
  auditEvents,
  gatePolicies,
  githubRepositories,
  replayProfiles,
  serviceRepositoryConnections,
} from "./schema";
import { withOrganizationContext } from "./tenancy";

function assertRepositoryPath(value: string): void {
  if (
    value.startsWith("/") ||
    value.includes("\\") ||
    value.split("/").some((segment) => segment === "" || segment === "." || segment === "..")
  ) {
    throw new TypeError("Repository paths must be normalized, relative, and traversal-free");
  }
}

export async function listServiceRepositoryConnections(
  db: Database,
  organizationId: string,
  apiServiceId: string,
) {
  return withOrganizationContext(db, organizationId, async (tx) => {
    const [repositories, connections] = await Promise.all([
      tx
        .select({
          id: githubRepositories.id,
          ownerLogin: githubRepositories.ownerLogin,
          name: githubRepositories.name,
          defaultBranch: githubRepositories.defaultBranch,
          active: githubRepositories.active,
        })
        .from(githubRepositories)
        .where(
          and(
            eq(githubRepositories.organizationId, organizationId),
            eq(githubRepositories.active, true),
            isNull(githubRepositories.deletedAt),
          ),
        )
        .orderBy(githubRepositories.ownerLogin, githubRepositories.name),
      tx
        .select({
          id: serviceRepositoryConnections.id,
          githubRepositoryId: serviceRepositoryConnections.githubRepositoryId,
          ownerLogin: githubRepositories.ownerLogin,
          repositoryName: githubRepositories.name,
          specPath: serviceRepositoryConnections.specPath,
          workflowPath: serviceRepositoryConnections.workflowPath,
          baseImageBuildRef: serviceRepositoryConnections.baseImageBuildRef,
          candidateImageBuildRef: serviceRepositoryConnections.candidateImageBuildRef,
          active: serviceRepositoryConnections.active,
          createdAt: serviceRepositoryConnections.createdAt,
        })
        .from(serviceRepositoryConnections)
        .innerJoin(
          githubRepositories,
          and(
            eq(githubRepositories.organizationId, serviceRepositoryConnections.organizationId),
            eq(githubRepositories.id, serviceRepositoryConnections.githubRepositoryId),
          ),
        )
        .where(
          and(
            eq(serviceRepositoryConnections.organizationId, organizationId),
            eq(serviceRepositoryConnections.apiServiceId, apiServiceId),
            eq(serviceRepositoryConnections.active, true),
            isNull(serviceRepositoryConnections.deletedAt),
          ),
        )
        .orderBy(desc(serviceRepositoryConnections.createdAt)),
    ]);
    return { repositories, connections };
  });
}

export async function createServiceRepositoryConnection(
  db: Database,
  organizationId: string,
  apiServiceId: string,
  actor: { membershipId: string; userId: string; requestId: string },
  input: CreateRepositoryConnection,
) {
  assertRepositoryPath(input.specPath);
  assertRepositoryPath(input.workflowPath);
  return withOrganizationContext(db, organizationId, async (tx) => {
    const [[repository], [policy], [profile]] = await Promise.all([
      tx
        .select({ id: githubRepositories.id })
        .from(githubRepositories)
        .where(
          and(
            eq(githubRepositories.organizationId, organizationId),
            eq(githubRepositories.id, input.githubRepositoryId),
            eq(githubRepositories.active, true),
            isNull(githubRepositories.deletedAt),
          ),
        )
        .limit(1),
      tx
        .select({ id: gatePolicies.id })
        .from(gatePolicies)
        .where(
          and(
            eq(gatePolicies.organizationId, organizationId),
            eq(gatePolicies.apiServiceId, apiServiceId),
            eq(gatePolicies.isDefault, true),
            isNull(gatePolicies.deletedAt),
          ),
        )
        .limit(1),
      tx
        .select({ id: replayProfiles.id })
        .from(replayProfiles)
        .where(
          and(
            eq(replayProfiles.organizationId, organizationId),
            eq(replayProfiles.apiServiceId, apiServiceId),
            eq(replayProfiles.status, "active"),
          ),
        )
        .limit(1),
    ]);
    if (!repository) throw new Error("GitHub repository is unavailable");
    if (!policy || !profile)
      throw new Error("Service gate policy or replay profile is unavailable");
    const [connection] = await tx
      .insert(serviceRepositoryConnections)
      .values({
        organizationId,
        apiServiceId,
        githubRepositoryId: repository.id,
        gatePolicyId: policy.id,
        replayProfileId: profile.id,
        specPath: input.specPath,
        workflowPath: input.workflowPath,
        baseImageBuildRef: input.baseImageBuildRef,
        candidateImageBuildRef: input.candidateImageBuildRef,
      })
      .returning({ id: serviceRepositoryConnections.id });
    if (!connection) throw new Error("Repository connection creation returned no record");
    await tx.insert(auditEvents).values({
      organizationId,
      occurredAt: new Date(),
      actorType: "user",
      actorId: actor.userId,
      action: "service_repository.connected",
      resourceType: "service_repository_connection",
      resourceId: connection.id,
      requestId: actor.requestId,
      changes: {
        apiServiceId,
        githubRepositoryId: repository.id,
        specPath: input.specPath,
        workflowPath: input.workflowPath,
      },
      outcome: "succeeded",
    });
    return connection;
  });
}
