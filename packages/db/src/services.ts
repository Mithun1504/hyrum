import { createHash } from "node:crypto";
import type { CreateServiceRequest } from "@hyrum/contracts";
import { and, desc, eq, lt, or } from "drizzle-orm";
import type { Database } from "./index";
import {
  apiServices,
  auditEvents,
  extractorReleases,
  gatePolicies,
  gatePolicyVersions,
  maskProfileVersions,
  onboardingProgress,
  organizationKeyVersions,
  outboxEvents,
  redactionPolicyVersions,
  replayProfiles,
  samplingPolicyVersions,
  serviceEnvironments,
} from "./schema";
import { withOrganizationContext } from "./tenancy";

export interface ServiceActor {
  userId: string;
  membershipId: string;
  requestId: string;
}

export interface ServiceCursor {
  createdAt: Date;
  id: string;
}

export interface ServiceRecord {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  status: "onboarding" | "active" | "paused" | "archived";
  ownerMembershipId: string;
  firstCaptureAt: Date | null;
  firstUsefulLedgerAt: Date | null;
  createdAt: Date;
  defaultEnvironment: {
    id: string;
    name: string;
    slug: string;
    kind: "production" | "staging" | "development" | "demo";
    baseUrlOrigin: string | null;
    captureEnabled: boolean;
    isDefault: boolean;
  };
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function eventDigest(payload: unknown): string {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

function toRecord(
  service: typeof apiServices.$inferSelect,
  environment: typeof serviceEnvironments.$inferSelect,
): ServiceRecord {
  return {
    id: service.id,
    name: service.name,
    slug: service.slug,
    description: service.description,
    status: service.status,
    ownerMembershipId: service.ownerMembershipId,
    firstCaptureAt: service.firstCaptureAt,
    firstUsefulLedgerAt: service.firstUsefulLedgerAt,
    createdAt: service.createdAt,
    defaultEnvironment: {
      id: environment.id,
      name: environment.name,
      slug: environment.slug,
      kind: environment.kind,
      baseUrlOrigin: environment.baseUrlOrigin,
      captureEnabled: environment.captureEnabled,
      isDefault: environment.isDefault,
    },
  };
}

export async function createApiService(
  db: Database,
  organizationId: string,
  actor: ServiceActor,
  input: CreateServiceRequest,
): Promise<ServiceRecord> {
  return withOrganizationContext(db, organizationId, async (tx) => {
    const [service] = await tx
      .insert(apiServices)
      .values({
        organizationId,
        name: input.name,
        slug: input.slug,
        description: input.description ?? null,
        ownerMembershipId: actor.membershipId,
      })
      .returning();
    if (!service) throw new Error("Service creation returned no record");

    const [environment] = await tx
      .insert(serviceEnvironments)
      .values({
        organizationId,
        apiServiceId: service.id,
        name: input.environment.name,
        slug: input.environment.slug,
        kind: input.environment.kind,
        baseUrlOrigin: input.environment.baseUrlOrigin ?? null,
        isDefault: true,
      })
      .returning();
    if (!environment) throw new Error("Default environment creation returned no record");

    const now = new Date();
    const [insertedExtractor] = await tx
      .insert(extractorReleases)
      .values({
        semanticVersion: "1.0.0",
        sourceCommitSha: "repository-build",
        binaryDigest: "sha256:repository-extractor-v1",
        fingerprintSchemaVersion: 1,
        releasedAt: now,
      })
      .onConflictDoNothing()
      .returning({ id: extractorReleases.id });
    const [existingExtractor] = insertedExtractor
      ? [insertedExtractor]
      : await tx
          .select({ id: extractorReleases.id })
          .from(extractorReleases)
          .where(eq(extractorReleases.semanticVersion, "1.0.0"))
          .limit(1);
    const extractor = insertedExtractor ?? existingExtractor;
    if (!extractor) throw new Error("Default extractor release is unavailable");

    const keys = [];
    for (const purpose of ["structural_hmac", "consumer_identity_hmac"] as const) {
      const [inserted] = await tx
        .insert(organizationKeyVersions)
        .values({
          organizationId,
          purpose,
          version: 1,
          kmsKeyReference: `derived:v1:${organizationId}:${purpose}`,
          status: "active",
          activatedAt: now,
        })
        .onConflictDoNothing()
        .returning({ id: organizationKeyVersions.id, purpose: organizationKeyVersions.purpose });
      if (inserted) {
        keys.push(inserted);
        continue;
      }
      const [existing] = await tx
        .select({ id: organizationKeyVersions.id, purpose: organizationKeyVersions.purpose })
        .from(organizationKeyVersions)
        .where(
          and(
            eq(organizationKeyVersions.organizationId, organizationId),
            eq(organizationKeyVersions.purpose, purpose),
            eq(organizationKeyVersions.status, "active"),
          ),
        )
        .limit(1);
      if (!existing) throw new Error(`Active ${purpose} key is unavailable`);
      keys.push(existing);
    }
    const structuralKey = keys.find(({ purpose }) => purpose === "structural_hmac");
    const consumerKey = keys.find(({ purpose }) => purpose === "consumer_identity_hmac");
    if (!structuralKey || !consumerKey) throw new Error("Default capture keys are unavailable");
    const defaultRedactionCel =
      'drop_headers(["authorization","cookie","proxy-authorization","set-cookie","x-api-key","x-auth-token"])';
    await Promise.all([
      tx.insert(redactionPolicyVersions).values({
        organizationId,
        apiServiceId: service.id,
        version: 1,
        status: "active",
        celSource: defaultRedactionCel,
        compiledDigest: eventDigest(defaultRedactionCel),
        structuralHmacKeyVersionId: structuralKey.id,
        consumerHmacKeyVersionId: consumerKey.id,
        createdByMembershipId: actor.membershipId,
        activatedAt: now,
      }),
      tx.insert(samplingPolicyVersions).values({
        organizationId,
        apiServiceId: service.id,
        version: 1,
        sessionWindowSeconds: 900,
        baseSampleRate: "0.10000",
        lowVolumeThreshold: 100,
        lowVolumeBoost: "3.00",
        correlationHeaderNames: ["x-request-id", "x-correlation-id"],
        compiledDigest: eventDigest({ window: 900, rate: 0.1, threshold: 100, boost: 3 }),
        status: "active",
        createdByMembershipId: actor.membershipId,
        activatedAt: now,
      }),
    ]);

    const defaultMaskRules = {
      ignoreHeaders: ["date", "server", "x-request-id", "traceparent"],
      ignoreJsonPaths: [],
      unorderedJsonPaths: [],
    };
    const [maskProfile] = await tx
      .insert(maskProfileVersions)
      .values({
        organizationId,
        apiServiceId: service.id,
        version: 1,
        rules: defaultMaskRules,
        rulesDigest: eventDigest(defaultMaskRules),
        status: "active",
        createdByMembershipId: actor.membershipId,
        activatedAt: now,
      })
      .returning({ id: maskProfileVersions.id, rulesDigest: maskProfileVersions.rulesDigest });
    if (!maskProfile) throw new Error("Default mask profile creation returned no record");
    const defaultReplayProfile = {
      allowedOperationMode: "read_only",
      networkEgressEnabled: false,
      requestTimeoutMs: 5_000,
      resourceLimits: { cpuCount: 1, memoryMb: 512, pids: 128 },
      maskDigest: maskProfile.rulesDigest,
    } as const;
    await tx.insert(replayProfiles).values({
      organizationId,
      apiServiceId: service.id,
      version: 1,
      name: "Safe read-only",
      maskProfileVersionId: maskProfile.id,
      allowedOperationMode: defaultReplayProfile.allowedOperationMode,
      networkEgressEnabled: defaultReplayProfile.networkEgressEnabled,
      requestTimeoutMs: defaultReplayProfile.requestTimeoutMs,
      resourceLimits: defaultReplayProfile.resourceLimits,
      configDigest: eventDigest(defaultReplayProfile),
      status: "active",
    });
    const [gatePolicy] = await tx
      .insert(gatePolicies)
      .values({
        organizationId,
        apiServiceId: service.id,
        name: "Default compatibility policy",
        description:
          "Blocks stable T1 and pinned-assertion breaks; lower evidence remains advisory.",
        isDefault: true,
        createdByMembershipId: actor.membershipId,
      })
      .returning({ id: gatePolicies.id });
    if (!gatePolicy) throw new Error("Default gate policy creation returned no record");
    const defaultGateConfig = {
      t1Action: "block",
      t2Action: "warn",
      t3Action: "pass",
      assertionAction: "block",
      flakyAction: "warn",
      minimumStableAttempts: 2,
    } as const;
    await tx.insert(gatePolicyVersions).values({
      organizationId,
      gatePolicyId: gatePolicy.id,
      version: 1,
      config: defaultGateConfig,
      configDigest: eventDigest(defaultGateConfig),
      ...defaultGateConfig,
      status: "active",
      createdByMembershipId: actor.membershipId,
      activatedAt: now,
    });

    await tx.insert(onboardingProgress).values({
      organizationId,
      apiServiceId: service.id,
      currentStep: "specification",
      completedSteps: ["service_and_environment"],
    });

    const eventPayload = {
      serviceId: service.id,
      environmentId: environment.id,
      status: service.status,
    };
    await Promise.all([
      tx.insert(auditEvents).values({
        organizationId,
        occurredAt: new Date(),
        actorType: "user",
        actorId: actor.userId,
        action: "service.created",
        resourceType: "api_service",
        resourceId: service.id,
        requestId: actor.requestId,
        changes: eventPayload,
        outcome: "succeeded",
      }),
      tx.insert(outboxEvents).values({
        organizationId,
        topic: "service.created",
        aggregateType: "api_service",
        aggregateId: service.id,
        eventVersion: 1,
        payload: eventPayload,
        payloadDigest: eventDigest(eventPayload),
      }),
    ]);

    return toRecord(service, environment);
  });
}

export async function listApiServices(
  db: Database,
  organizationId: string,
  limit: number,
  cursor?: ServiceCursor,
): Promise<{ records: ServiceRecord[]; nextCursor: ServiceCursor | null }> {
  return withOrganizationContext(db, organizationId, async (tx) => {
    const rows = await tx
      .select({ service: apiServices, environment: serviceEnvironments })
      .from(apiServices)
      .innerJoin(
        serviceEnvironments,
        and(
          eq(serviceEnvironments.apiServiceId, apiServices.id),
          eq(serviceEnvironments.isDefault, true),
        ),
      )
      .where(
        and(
          eq(apiServices.organizationId, organizationId),
          eq(serviceEnvironments.organizationId, organizationId),
          cursor
            ? or(
                lt(apiServices.createdAt, cursor.createdAt),
                and(eq(apiServices.createdAt, cursor.createdAt), lt(apiServices.id, cursor.id)),
              )
            : undefined,
        ),
      )
      .orderBy(desc(apiServices.createdAt), desc(apiServices.id))
      .limit(limit + 1);
    const hasMore = rows.length > limit;
    const visible = hasMore ? rows.slice(0, limit) : rows;
    const last = visible.at(-1)?.service;
    return {
      records: visible.map(({ service, environment }) => toRecord(service, environment)),
      nextCursor: hasMore && last ? { createdAt: last.createdAt, id: last.id } : null,
    };
  });
}

/** Resolve a service by its stable UUID or human-readable slug within one tenant. */
export async function getApiService(
  db: Database,
  organizationId: string,
  identifier: string,
): Promise<ServiceRecord | null> {
  return withOrganizationContext(db, organizationId, async (tx) => {
    const serviceIdentity = UUID_PATTERN.test(identifier)
      ? or(eq(apiServices.id, identifier), eq(apiServices.slug, identifier))
      : eq(apiServices.slug, identifier);
    const [row] = await tx
      .select({ service: apiServices, environment: serviceEnvironments })
      .from(apiServices)
      .innerJoin(
        serviceEnvironments,
        and(
          eq(serviceEnvironments.apiServiceId, apiServices.id),
          eq(serviceEnvironments.isDefault, true),
        ),
      )
      .where(
        and(
          eq(apiServices.organizationId, organizationId),
          eq(serviceEnvironments.organizationId, organizationId),
          serviceIdentity,
        ),
      )
      .limit(1);

    return row ? toRecord(row.service, row.environment) : null;
  });
}
