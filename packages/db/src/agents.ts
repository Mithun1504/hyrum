import { createHash } from "node:crypto";
import type { CreateAgentRequest, MachineScope } from "@hyrum/contracts";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import type { Database, DatabaseClient } from "./index";
import {
  agents,
  apiServices,
  auditEvents,
  extractorReleases,
  ingestionBatches,
  jobs,
  machineCredentials,
  onboardingProgress,
  organizationSettings,
  outboxEvents,
  redactionPolicyVersions,
  samplingPolicyVersions,
  serviceEnvironments,
  storedObjects,
} from "./schema";
import { withOrganizationContext } from "./tenancy";

export interface AgentActor {
  userId: string;
  requestId: string;
}

export interface AgentRecord {
  id: string;
  apiServiceId: string;
  environmentId: string;
  name: string;
  externalInstanceKey: string;
  status: "pending" | "online" | "degraded" | "offline" | "revoked";
  adapterType: "ndjson" | "http_proxy" | "kong" | "envoy_als" | "log_tap";
  agentVersion: string;
  extractorReleaseId: string;
  redactionPolicyVersionId: string;
  samplingPolicyVersionId: string;
  configRevision: number;
  lastSeenAt: Date | null;
  lastErrorCode: string | null;
  revokedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface MachineCredentialLookup {
  credentialId: string;
  organizationId: string;
  agentId: string;
  apiServiceId: string;
  environmentId: string;
  tokenHash: string;
  scopes: MachineScope[];
}

export interface AgentConfigurationRecord {
  agentId: string;
  configRevision: number;
  extractor: { id: string; semanticVersion: string; schemaVersion: number };
  redaction: { id: string; version: number; celSource: string };
  sampling: {
    id: string;
    version: number;
    sessionWindowSeconds: number;
    baseSampleRate: number;
    lowVolumeThreshold: number;
    lowVolumeBoost: number;
    correlationHeaderNames: string[];
  };
  keyVersionIds: { structural: string; consumerIdentity: string };
}

const ALL_AGENT_SCOPES = ["config:read", "heartbeat:write", "ingestion:write"] as const;

function eventDigest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export async function createAgent(
  db: Database,
  organizationId: string,
  apiServiceId: string,
  actor: AgentActor,
  input: CreateAgentRequest,
  credential: { tokenPrefix: string; tokenHash: string; expiresAt: Date },
): Promise<{ agent: AgentRecord; credentialId: string }> {
  return withOrganizationContext(db, organizationId, async (tx) => {
    const [configuration] = await tx
      .select({
        environmentId: serviceEnvironments.id,
        extractorId: extractorReleases.id,
        redactionId: redactionPolicyVersions.id,
        redactionStatus: redactionPolicyVersions.status,
        samplingId: samplingPolicyVersions.id,
        samplingStatus: samplingPolicyVersions.status,
      })
      .from(serviceEnvironments)
      .innerJoin(extractorReleases, eq(extractorReleases.id, input.extractorReleaseId))
      .innerJoin(
        redactionPolicyVersions,
        and(
          eq(redactionPolicyVersions.id, input.redactionPolicyVersionId),
          eq(redactionPolicyVersions.apiServiceId, apiServiceId),
        ),
      )
      .innerJoin(
        samplingPolicyVersions,
        and(
          eq(samplingPolicyVersions.id, input.samplingPolicyVersionId),
          eq(samplingPolicyVersions.apiServiceId, apiServiceId),
        ),
      )
      .where(
        and(
          eq(serviceEnvironments.organizationId, organizationId),
          eq(serviceEnvironments.apiServiceId, apiServiceId),
          eq(serviceEnvironments.id, input.environmentId),
          isNull(serviceEnvironments.deletedAt),
        ),
      )
      .limit(1);
    if (!configuration) throw new Error("Agent configuration does not belong to this service");
    if (configuration.redactionStatus !== "active" || configuration.samplingStatus !== "active") {
      throw new Error("Agent registration requires active redaction and sampling policies");
    }

    const [created] = await tx
      .insert(agents)
      .values({
        organizationId,
        apiServiceId,
        environmentId: input.environmentId,
        name: input.name,
        externalInstanceKey: input.externalInstanceKey,
        adapterType: input.adapterType,
        agentVersion: input.agentVersion,
        extractorReleaseId: input.extractorReleaseId,
        redactionPolicyVersionId: input.redactionPolicyVersionId,
        samplingPolicyVersionId: input.samplingPolicyVersionId,
      })
      .returning();
    if (!created) throw new Error("Agent creation returned no record");
    const [issued] = await tx
      .insert(machineCredentials)
      .values({
        organizationId,
        agentId: created.id,
        tokenPrefix: credential.tokenPrefix,
        tokenHash: credential.tokenHash,
        scopes: [...ALL_AGENT_SCOPES],
        expiresAt: credential.expiresAt,
      })
      .returning({ id: machineCredentials.id });
    if (!issued) throw new Error("Credential creation returned no record");
    const event = { agentId: created.id, apiServiceId, environmentId: created.environmentId };
    await Promise.all([
      tx.insert(auditEvents).values({
        organizationId,
        occurredAt: new Date(),
        actorType: "user",
        actorId: actor.userId,
        action: "agent.created",
        resourceType: "agent",
        resourceId: created.id,
        requestId: actor.requestId,
        changes: event,
        outcome: "succeeded",
      }),
      tx.insert(outboxEvents).values({
        organizationId,
        topic: "agent.created",
        aggregateType: "agent",
        aggregateId: created.id,
        eventVersion: 1,
        payload: event,
        payloadDigest: eventDigest(event),
      }),
    ]);
    return { agent: created, credentialId: issued.id };
  });
}

export async function listAgents(
  db: Database,
  organizationId: string,
  apiServiceId: string,
): Promise<AgentRecord[]> {
  return withOrganizationContext(db, organizationId, (tx) =>
    tx
      .select()
      .from(agents)
      .where(and(eq(agents.organizationId, organizationId), eq(agents.apiServiceId, apiServiceId)))
      .orderBy(desc(agents.createdAt)),
  );
}

export async function getAgentRegistrationDefaults(
  db: Database,
  organizationId: string,
  apiServiceId: string,
): Promise<{
  environmentId: string;
  environmentName: string;
  extractorReleaseId: string;
  extractorVersion: string;
  redactionPolicyVersionId: string;
  redactionPolicyVersion: number;
  samplingPolicyVersionId: string;
  samplingPolicyVersion: number;
} | null> {
  return withOrganizationContext(db, organizationId, async (tx) => {
    const [row] = await tx
      .select({
        environmentId: serviceEnvironments.id,
        environmentName: serviceEnvironments.name,
        extractorReleaseId: extractorReleases.id,
        extractorVersion: extractorReleases.semanticVersion,
        redactionPolicyVersionId: redactionPolicyVersions.id,
        redactionPolicyVersion: redactionPolicyVersions.version,
        samplingPolicyVersionId: samplingPolicyVersions.id,
        samplingPolicyVersion: samplingPolicyVersions.version,
      })
      .from(serviceEnvironments)
      .innerJoin(
        redactionPolicyVersions,
        and(
          eq(redactionPolicyVersions.apiServiceId, apiServiceId),
          eq(redactionPolicyVersions.status, "active"),
        ),
      )
      .innerJoin(
        samplingPolicyVersions,
        and(
          eq(samplingPolicyVersions.apiServiceId, apiServiceId),
          eq(samplingPolicyVersions.status, "active"),
        ),
      )
      .innerJoin(extractorReleases, eq(extractorReleases.semanticVersion, "1.0.0"))
      .where(
        and(
          eq(serviceEnvironments.organizationId, organizationId),
          eq(serviceEnvironments.apiServiceId, apiServiceId),
          eq(serviceEnvironments.isDefault, true),
          isNull(serviceEnvironments.deletedAt),
        ),
      )
      .limit(1);
    return row ?? null;
  });
}

export async function resolveMachineCredential(
  client: DatabaseClient,
  tokenPrefix: string,
): Promise<MachineCredentialLookup | null> {
  const rows = await client.sql<
    Array<{
      credential_id: string;
      organization_id: string;
      agent_id: string;
      api_service_id: string;
      environment_id: string;
      token_hash: string;
      scopes: MachineScope[];
    }>
  >`select * from hyrum_resolve_machine_credential(${tokenPrefix})`;
  const row = rows[0];
  return row
    ? {
        credentialId: row.credential_id,
        organizationId: row.organization_id,
        agentId: row.agent_id,
        apiServiceId: row.api_service_id,
        environmentId: row.environment_id,
        tokenHash: row.token_hash,
        scopes: row.scopes,
      }
    : null;
}

export async function touchMachineCredential(
  client: DatabaseClient,
  credentialId: string,
): Promise<void> {
  await client.sql`select hyrum_touch_machine_credential(${credentialId}::uuid)`;
}

export async function getAgentConfiguration(
  db: Database,
  principal: Pick<MachineCredentialLookup, "organizationId" | "agentId">,
): Promise<AgentConfigurationRecord | null> {
  return withOrganizationContext(db, principal.organizationId, async (tx) => {
    const [row] = await tx
      .select({
        agentId: agents.id,
        configRevision: agents.configRevision,
        extractorId: extractorReleases.id,
        semanticVersion: extractorReleases.semanticVersion,
        schemaVersion: extractorReleases.fingerprintSchemaVersion,
        redactionId: redactionPolicyVersions.id,
        redactionVersion: redactionPolicyVersions.version,
        celSource: redactionPolicyVersions.celSource,
        structuralKeyVersionId: redactionPolicyVersions.structuralHmacKeyVersionId,
        consumerKeyVersionId: redactionPolicyVersions.consumerHmacKeyVersionId,
        samplingId: samplingPolicyVersions.id,
        samplingVersion: samplingPolicyVersions.version,
        sessionWindowSeconds: samplingPolicyVersions.sessionWindowSeconds,
        baseSampleRate: samplingPolicyVersions.baseSampleRate,
        lowVolumeThreshold: samplingPolicyVersions.lowVolumeThreshold,
        lowVolumeBoost: samplingPolicyVersions.lowVolumeBoost,
        correlationHeaderNames: samplingPolicyVersions.correlationHeaderNames,
      })
      .from(agents)
      .innerJoin(extractorReleases, eq(extractorReleases.id, agents.extractorReleaseId))
      .innerJoin(
        redactionPolicyVersions,
        eq(redactionPolicyVersions.id, agents.redactionPolicyVersionId),
      )
      .innerJoin(
        samplingPolicyVersions,
        eq(samplingPolicyVersions.id, agents.samplingPolicyVersionId),
      )
      .where(
        and(
          eq(agents.organizationId, principal.organizationId),
          eq(agents.id, principal.agentId),
          isNull(agents.revokedAt),
        ),
      )
      .limit(1);
    if (!row) return null;
    return {
      agentId: row.agentId,
      configRevision: row.configRevision,
      extractor: {
        id: row.extractorId,
        semanticVersion: row.semanticVersion,
        schemaVersion: row.schemaVersion,
      },
      redaction: { id: row.redactionId, version: row.redactionVersion, celSource: row.celSource },
      sampling: {
        id: row.samplingId,
        version: row.samplingVersion,
        sessionWindowSeconds: row.sessionWindowSeconds,
        baseSampleRate: Number(row.baseSampleRate),
        lowVolumeThreshold: row.lowVolumeThreshold,
        lowVolumeBoost: Number(row.lowVolumeBoost),
        correlationHeaderNames: row.correlationHeaderNames,
      },
      keyVersionIds: {
        structural: row.structuralKeyVersionId,
        consumerIdentity: row.consumerKeyVersionId,
      },
    };
  });
}

export async function recordAgentHeartbeat(
  db: Database,
  principal: Pick<MachineCredentialLookup, "organizationId" | "agentId">,
  input: {
    agentVersion: string;
    status: "online" | "degraded";
    errorCode?: string | null | undefined;
  },
): Promise<number | null> {
  return withOrganizationContext(db, principal.organizationId, async (tx) => {
    const [updated] = await tx
      .update(agents)
      .set({
        agentVersion: input.agentVersion,
        status: input.status,
        lastErrorCode: input.errorCode ?? null,
        lastSeenAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(agents.organizationId, principal.organizationId),
          eq(agents.id, principal.agentId),
          isNull(agents.revokedAt),
        ),
      )
      .returning({ configRevision: agents.configRevision });
    return updated?.configRevision ?? null;
  });
}

export async function rotateAgentCredential(
  db: Database,
  organizationId: string,
  agentId: string,
  actor: AgentActor,
  credential: { tokenPrefix: string; tokenHash: string; expiresAt: Date },
): Promise<string> {
  return withOrganizationContext(db, organizationId, async (tx) => {
    const [agent] = await tx
      .select({ id: agents.id })
      .from(agents)
      .where(
        and(
          eq(agents.organizationId, organizationId),
          eq(agents.id, agentId),
          isNull(agents.revokedAt),
        ),
      )
      .limit(1);
    if (!agent) throw new Error("Agent not found");
    const [current] = await tx
      .select({ id: machineCredentials.id })
      .from(machineCredentials)
      .where(
        and(
          eq(machineCredentials.organizationId, organizationId),
          eq(machineCredentials.agentId, agentId),
          isNull(machineCredentials.revokedAt),
        ),
      )
      .orderBy(desc(machineCredentials.createdAt))
      .limit(1);
    const [issued] = await tx
      .insert(machineCredentials)
      .values({
        organizationId,
        agentId,
        tokenPrefix: credential.tokenPrefix,
        tokenHash: credential.tokenHash,
        scopes: [...ALL_AGENT_SCOPES],
        expiresAt: credential.expiresAt,
        rotatedFromId: current?.id ?? null,
      })
      .returning({ id: machineCredentials.id });
    if (!issued) throw new Error("Credential rotation returned no record");
    if (current) {
      await tx
        .update(machineCredentials)
        .set({ revokedAt: new Date(), updatedAt: new Date() })
        .where(eq(machineCredentials.id, current.id));
    }
    await tx.insert(auditEvents).values({
      organizationId,
      occurredAt: new Date(),
      actorType: "user",
      actorId: actor.userId,
      action: "agent.credential_rotated",
      resourceType: "agent",
      resourceId: agentId,
      requestId: actor.requestId,
      changes: { credentialId: issued.id, rotatedFromId: current?.id ?? null },
      outcome: "succeeded",
    });
    return issued.id;
  });
}

export async function revokeAgent(
  db: Database,
  organizationId: string,
  agentId: string,
  actor: AgentActor,
): Promise<boolean> {
  return withOrganizationContext(db, organizationId, async (tx) => {
    const now = new Date();
    const [updated] = await tx
      .update(agents)
      .set({ status: "revoked", revokedAt: now, updatedAt: now })
      .where(
        and(
          eq(agents.organizationId, organizationId),
          eq(agents.id, agentId),
          isNull(agents.revokedAt),
        ),
      )
      .returning({ id: agents.id });
    if (!updated) return false;
    await Promise.all([
      tx
        .update(machineCredentials)
        .set({ revokedAt: now, updatedAt: now })
        .where(
          and(
            eq(machineCredentials.organizationId, organizationId),
            eq(machineCredentials.agentId, agentId),
            isNull(machineCredentials.revokedAt),
          ),
        ),
      tx.insert(auditEvents).values({
        organizationId,
        occurredAt: now,
        actorType: "user",
        actorId: actor.userId,
        action: "agent.revoked",
        resourceType: "agent",
        resourceId: agentId,
        requestId: actor.requestId,
        changes: {},
        outcome: "succeeded",
      }),
    ]);
    return true;
  });
}

export interface IngestionRejection {
  index: number;
  code: string;
  detail: string;
}

export interface IngestionObjectDescriptor {
  bucket: string;
  objectKey: string;
  byteSize: number;
  sha256Digest: string;
  contentType: string;
  contentEncoding: string | null;
}

export interface IngestionBatchRecord {
  batchId: string;
  duplicate: boolean;
  status: "validated" | "partially_rejected";
  sessionCount: number;
  acceptedItemCount: number;
  rejectedItemCount: number;
  rejections: IngestionRejection[];
  retainedObjectKeys: string[];
}

async function registerCaptureObject(
  tx: Parameters<Parameters<Database["transaction"]>[0]>[0],
  organizationId: string,
  agentId: string,
  kind: "capture_batch" | "generated_artifact",
  object: IngestionObjectDescriptor,
  expiresAt: Date,
): Promise<{ id: string; objectKey: string }> {
  const now = new Date();
  const [created] = await tx
    .insert(storedObjects)
    .values({
      organizationId,
      kind,
      bucket: object.bucket,
      objectKey: object.objectKey,
      contentType: object.contentType,
      contentEncoding: object.contentEncoding,
      byteSize: BigInt(object.byteSize),
      sha256Digest: object.sha256Digest,
      scanStatus: "not_required",
      availabilityStatus: "available",
      expiresAt,
      verifiedAt: now,
      createdByActorType: "agent",
      createdByActorId: agentId,
    })
    .onConflictDoNothing()
    .returning({ id: storedObjects.id, objectKey: storedObjects.objectKey });
  if (created) return created;
  const [existing] = await tx
    .select({ id: storedObjects.id, objectKey: storedObjects.objectKey })
    .from(storedObjects)
    .where(
      and(
        eq(storedObjects.organizationId, organizationId),
        eq(storedObjects.kind, kind),
        eq(storedObjects.sha256Digest, object.sha256Digest),
        eq(storedObjects.availabilityStatus, "available"),
        isNull(storedObjects.deletedAt),
      ),
    )
    .limit(1);
  if (!existing) throw new Error("Unable to register capture object");
  return existing;
}

export async function findIngestionBatch(
  db: Database,
  principal: Pick<MachineCredentialLookup, "organizationId" | "agentId">,
  agentBatchId: string,
): Promise<IngestionBatchRecord | null> {
  return withOrganizationContext(db, principal.organizationId, async (tx) => {
    const [batch] = await tx
      .select()
      .from(ingestionBatches)
      .where(
        and(
          eq(ingestionBatches.organizationId, principal.organizationId),
          eq(ingestionBatches.agentId, principal.agentId),
          eq(ingestionBatches.agentBatchId, agentBatchId),
        ),
      )
      .limit(1);
    if (!batch || (batch.status !== "validated" && batch.status !== "partially_rejected"))
      return null;
    const summary = batch.rejectionSummary as { rejections?: IngestionRejection[] };
    return {
      batchId: batch.id,
      duplicate: true,
      status: batch.status,
      sessionCount: batch.sessionCount,
      acceptedItemCount: batch.acceptedItemCount,
      rejectedItemCount: batch.rejectedItemCount,
      rejections: summary.rejections ?? [],
      retainedObjectKeys: [],
    };
  });
}

export async function persistIngestionBatch(
  db: Database,
  principal: MachineCredentialLookup,
  input: {
    agentBatchId: string;
    payloadDigest: string;
    schemaVersion: number;
    extractorReleaseId: string;
    redactionPolicyVersionId: string;
    samplingPolicyVersionId: string;
    acceptedItemCount: number;
    rejectedItemCount: number;
    rejections: IngestionRejection[];
  },
  captureObject: IngestionObjectDescriptor,
  rejectionObject: IngestionObjectDescriptor | null,
): Promise<IngestionBatchRecord> {
  return withOrganizationContext(db, principal.organizationId, async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`${principal.agentId}:${input.agentBatchId}`}, 0))`,
    );
    const [existing] = await tx
      .select()
      .from(ingestionBatches)
      .where(
        and(
          eq(ingestionBatches.organizationId, principal.organizationId),
          eq(ingestionBatches.agentId, principal.agentId),
          eq(ingestionBatches.agentBatchId, input.agentBatchId),
        ),
      )
      .limit(1);
    if (existing) {
      if (existing.payloadDigest !== input.payloadDigest) {
        throw new Error("Agent batch ID was already used with different content");
      }
      const summary = existing.rejectionSummary as { rejections?: IngestionRejection[] };
      return {
        batchId: existing.id,
        duplicate: true,
        status: existing.status === "partially_rejected" ? "partially_rejected" : "validated",
        sessionCount: existing.sessionCount,
        acceptedItemCount: existing.acceptedItemCount,
        rejectedItemCount: existing.rejectedItemCount,
        rejections: summary.rejections ?? [],
        retainedObjectKeys: [],
      };
    }
    const [agent] = await tx
      .select()
      .from(agents)
      .where(
        and(
          eq(agents.organizationId, principal.organizationId),
          eq(agents.id, principal.agentId),
          isNull(agents.revokedAt),
        ),
      )
      .limit(1);
    if (!agent) throw new Error("Agent not found");
    if (
      agent.extractorReleaseId !== input.extractorReleaseId ||
      agent.redactionPolicyVersionId !== input.redactionPolicyVersionId ||
      agent.samplingPolicyVersionId !== input.samplingPolicyVersionId
    ) {
      throw new Error("Batch configuration does not match the agent configuration revision");
    }
    const [settings] = await tx
      .select({ ttl: organizationSettings.defaultReceiptTtlDays })
      .from(organizationSettings)
      .where(eq(organizationSettings.organizationId, principal.organizationId))
      .limit(1);
    const expiresAt = new Date(Date.now() + (settings?.ttl ?? 30) * 86_400_000);
    const storedCapture = await registerCaptureObject(
      tx,
      principal.organizationId,
      principal.agentId,
      "capture_batch",
      captureObject,
      expiresAt,
    );
    const storedRejections = rejectionObject
      ? await registerCaptureObject(
          tx,
          principal.organizationId,
          principal.agentId,
          "generated_artifact",
          rejectionObject,
          expiresAt,
        )
      : null;
    const status = input.rejectedItemCount > 0 ? "partially_rejected" : "validated";
    const [batch] = await tx
      .insert(ingestionBatches)
      .values({
        organizationId: principal.organizationId,
        apiServiceId: agent.apiServiceId,
        environmentId: agent.environmentId,
        agentId: agent.id,
        agentBatchId: input.agentBatchId,
        storedObjectId: storedCapture.id,
        payloadDigest: input.payloadDigest,
        schemaVersion: input.schemaVersion,
        extractorReleaseId: input.extractorReleaseId,
        redactionPolicyVersionId: input.redactionPolicyVersionId,
        samplingPolicyVersionId: input.samplingPolicyVersionId,
        sessionCount: input.acceptedItemCount,
        acceptedItemCount: input.acceptedItemCount,
        rejectedItemCount: input.rejectedItemCount,
        status,
        rejectionManifestObjectId: storedRejections?.id ?? null,
        rejectionSummary: { rejections: input.rejections.slice(0, 100) },
      })
      .returning({ id: ingestionBatches.id });
    if (!batch) throw new Error("Ingestion batch creation returned no record");
    const now = new Date();
    await Promise.all([
      tx.insert(jobs).values({
        organizationId: principal.organizationId,
        type: "process_ingestion_batch",
        payload: { ingestionBatchId: batch.id },
        idempotencyKey: `process_ingestion_batch:${batch.id}`,
        concurrencyKey: `service:${agent.apiServiceId}:ingestion`,
      }),
      tx.insert(outboxEvents).values({
        organizationId: principal.organizationId,
        topic: "ingestion.batch_validated",
        aggregateType: "ingestion_batch",
        aggregateId: batch.id,
        eventVersion: 1,
        payload: { ingestionBatchId: batch.id, acceptedItemCount: input.acceptedItemCount },
        payloadDigest: eventDigest({
          ingestionBatchId: batch.id,
          acceptedItemCount: input.acceptedItemCount,
        }),
      }),
      tx
        .update(agents)
        .set({ status: "online", lastSeenAt: now, lastErrorCode: null, updatedAt: now })
        .where(eq(agents.id, agent.id)),
      tx
        .update(apiServices)
        .set({
          firstCaptureAt: sql`coalesce(${apiServices.firstCaptureAt}, now())`,
          updatedAt: now,
        })
        .where(eq(apiServices.id, agent.apiServiceId)),
      tx
        .update(serviceEnvironments)
        .set({ captureEnabled: true, updatedAt: now })
        .where(eq(serviceEnvironments.id, agent.environmentId)),
      tx
        .update(onboardingProgress)
        .set({
          currentStep: "ledger",
          completedSteps: sql`array(select distinct unnest(${onboardingProgress.completedSteps} || ARRAY['capture']::text[]))`,
          lastErrorCode: null,
          updatedAt: now,
        })
        .where(eq(onboardingProgress.apiServiceId, agent.apiServiceId)),
    ]);
    return {
      batchId: batch.id,
      duplicate: false,
      status,
      sessionCount: input.acceptedItemCount,
      acceptedItemCount: input.acceptedItemCount,
      rejectedItemCount: input.rejectedItemCount,
      rejections: input.rejections,
      retainedObjectKeys: [
        storedCapture.objectKey,
        ...(storedRejections ? [storedRejections.objectKey] : []),
      ],
    };
  });
}
