import { and, desc, eq, ilike, isNull, or } from "drizzle-orm";
import type { Database } from "./index";
import {
  apiOperations,
  apiServices,
  behaviorDefinitions,
  consumers,
  dependencyClaims,
  ledgerEntries,
} from "./schema";
import { withOrganizationContext } from "./tenancy";

/** Search only privacy-reviewed display text; never index metadata, receipts, prompts, or identifiers. */
export async function searchOrganization(
  db: Database,
  organizationId: string,
  query: string,
  requestedLimit = 8,
) {
  return withOrganizationContext(db, organizationId, async (tx) => {
    const limit = Math.min(Math.max(requestedLimit, 1), 20);
    const normalizedQuery = query.trim().slice(0, 100);
    const pattern = `%${normalizedQuery.replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;
    const [endpoints, consumerRows, ledgerRows] = await Promise.all([
      tx
        .select({
          id: apiOperations.id,
          serviceName: apiServices.name,
          serviceSlug: apiServices.slug,
          method: apiOperations.httpMethod,
          path: apiOperations.normalizedPathTemplate,
          displayName: apiOperations.displayName,
        })
        .from(apiOperations)
        .innerJoin(
          apiServices,
          and(
            eq(apiServices.organizationId, apiOperations.organizationId),
            eq(apiServices.id, apiOperations.apiServiceId),
          ),
        )
        .where(
          and(
            eq(apiOperations.organizationId, organizationId),
            isNull(apiOperations.archivedAt),
            isNull(apiServices.deletedAt),
            or(
              ilike(apiOperations.normalizedPathTemplate, pattern),
              ilike(apiOperations.displayName, pattern),
              ilike(apiServices.name, pattern),
            ),
          ),
        )
        .orderBy(desc(apiOperations.lastSeenAt))
        .limit(limit),
      tx
        .select({
          id: consumers.id,
          serviceName: apiServices.name,
          serviceSlug: apiServices.slug,
          displayAlias: consumers.displayAlias,
          requestCount: consumers.requestCount,
        })
        .from(consumers)
        .innerJoin(
          apiServices,
          and(
            eq(apiServices.organizationId, consumers.organizationId),
            eq(apiServices.id, consumers.apiServiceId),
          ),
        )
        .where(
          and(
            eq(consumers.organizationId, organizationId),
            isNull(consumers.deletedAt),
            isNull(apiServices.deletedAt),
            or(ilike(consumers.displayAlias, pattern), ilike(apiServices.name, pattern)),
          ),
        )
        .orderBy(desc(consumers.lastSeenAt))
        .limit(limit),
      tx
        .select({
          id: ledgerEntries.id,
          serviceName: apiServices.name,
          serviceSlug: apiServices.slug,
          consumerAlias: consumers.displayAlias,
          behaviorLabel: behaviorDefinitions.defaultLabel,
          method: apiOperations.httpMethod,
          path: apiOperations.normalizedPathTemplate,
          tier: dependencyClaims.tier,
          freshnessStatus: ledgerEntries.freshnessStatus,
        })
        .from(ledgerEntries)
        .innerJoin(
          dependencyClaims,
          and(
            eq(dependencyClaims.organizationId, ledgerEntries.organizationId),
            eq(dependencyClaims.id, ledgerEntries.dependencyClaimId),
          ),
        )
        .innerJoin(
          apiServices,
          and(
            eq(apiServices.organizationId, dependencyClaims.organizationId),
            eq(apiServices.id, dependencyClaims.apiServiceId),
          ),
        )
        .innerJoin(
          consumers,
          and(
            eq(consumers.organizationId, dependencyClaims.organizationId),
            eq(consumers.id, dependencyClaims.consumerId),
          ),
        )
        .innerJoin(
          behaviorDefinitions,
          and(
            eq(behaviorDefinitions.organizationId, dependencyClaims.organizationId),
            eq(behaviorDefinitions.id, dependencyClaims.behaviorDefinitionId),
          ),
        )
        .innerJoin(
          apiOperations,
          and(
            eq(apiOperations.organizationId, behaviorDefinitions.organizationId),
            eq(apiOperations.id, behaviorDefinitions.apiOperationId),
          ),
        )
        .where(
          and(
            eq(ledgerEntries.organizationId, organizationId),
            eq(dependencyClaims.status, "active"),
            or(
              ilike(behaviorDefinitions.defaultLabel, pattern),
              ilike(consumers.displayAlias, pattern),
              ilike(apiOperations.normalizedPathTemplate, pattern),
              ilike(apiOperations.displayName, pattern),
              ilike(apiServices.name, pattern),
            ),
          ),
        )
        .orderBy(desc(ledgerEntries.lastObservedAt))
        .limit(limit),
    ]);

    return {
      query: normalizedQuery,
      groups: {
        endpoints: endpoints.map((row) => ({
          id: row.id,
          serviceName: row.serviceName,
          serviceSlug: row.serviceSlug,
          title: row.displayName ?? `${row.method} ${row.path}`,
          subtitle: `${row.method} ${row.path}`,
          method: row.method,
          path: row.path,
          href: `/app/${row.serviceSlug}/ledger?search=${encodeURIComponent(row.path)}`,
        })),
        consumers: consumerRows.map((row) => ({
          id: row.id,
          serviceName: row.serviceName,
          serviceSlug: row.serviceSlug,
          title: row.displayAlias,
          subtitle: `${row.requestCount.toString()} observed requests`,
          requestCount: row.requestCount.toString(),
          href: `/app/${row.serviceSlug}/ledger?search=${encodeURIComponent(row.displayAlias)}`,
        })),
        ledger: ledgerRows.map((row) => ({
          id: row.id,
          serviceName: row.serviceName,
          serviceSlug: row.serviceSlug,
          title: row.behaviorLabel,
          subtitle: `${row.consumerAlias} · ${row.method} ${row.path}`,
          tier: row.tier,
          freshnessStatus: row.freshnessStatus,
          href: `/app/${row.serviceSlug}/ledger?search=${encodeURIComponent(row.behaviorLabel)}`,
        })),
      },
    };
  });
}
