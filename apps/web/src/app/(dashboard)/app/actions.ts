"use server";

import { createHash } from "node:crypto";
import { type SpecDraft, specDraftResponseSchema } from "@hyrum/contracts";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { controlPlaneBaseUrl, createControlPlane } from "@/services/control-plane";
import { dashboardAuth } from "@/services/dashboard-auth";

const assertionInputSchema = z.object({
  behavior_id: z.string().uuid(),
  claim_id: z.string().uuid().optional(),
  reason: z.string().trim().min(1, "Add a reason before pinning.").max(2_000),
  expires_at: z.string().date(),
});

const assertionResolutionSchema = z.discriminatedUnion("resolution", [
  z.object({
    assertion_id: z.string().uuid(),
    resolution: z.literal("documented"),
    reason: z.string().trim().min(3).max(2_000),
  }),
  z.object({
    assertion_id: z.string().uuid(),
    resolution: z.literal("extend"),
    reason: z.string().trim().min(3).max(2_000),
    expires_at: z.string().date(),
  }),
  z.object({
    assertion_id: z.string().uuid(),
    resolution: z.literal("schedule_break"),
    reason: z.string().trim().min(3).max(2_000),
    break_at: z.string().date(),
  }),
]);

const claimOverrideSchema = z.object({
  claim_id: z.string().uuid(),
  tier: z.enum(["T1", "T2", "T3", "automatic"]),
  reason: z.string().trim().min(3).max(1_000),
});

const policyInputSchema = z.object({
  version: z.coerce.number().int().positive(),
  t1_outcome: z.enum(["block", "warn", "pass"]),
  t2_outcome: z.enum(["warn", "pass"]),
  t3_outcome: z.enum(["warn", "pass"]),
});

const digestSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/, "Use a sha256: digest.");
const MAX_CORPUS_ARTIFACT_BYTES = 3 * 1024 * 1024;
const createCorpusSchema = z.object({
  version: z.string().trim().min(1).max(80),
  digest: digestSchema,
  object_key: z.string().trim().min(1).max(500),
  fixture_digest: digestSchema,
  fixture_object_key: z.string().trim().min(1).max(500),
  stubs_object_key: z.string().trim().max(500).optional(),
});
const createCorpusItemSchema = z.object({
  corpus_id: z.string().uuid(),
  case_id: z.string().trim().min(1).max(160),
  coverage_class: z.string().trim().min(1).max(80),
  object_key: z.string().trim().min(1).max(500),
  digest: digestSchema,
  priority: z.coerce.number().int().positive().max(10_000),
});
const updateCorpusStatusSchema = z.object({
  corpus_id: z.string().uuid(),
  curation_status: z.enum(["draft", "ready", "archived"]),
});

export type MutationState = {
  status: "idle" | "success" | "error";
  message: string;
};

export type CorpusArtifactUpload =
  | {
      status: "success";
      objectKey: string;
      digest: string;
    }
  | { status: "error"; message: string };

export async function uploadCorpusArtifactAction(
  formData: FormData,
): Promise<CorpusArtifactUpload> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return {
      status: "error",
      message: "Choose a non-empty artifact to upload.",
    };
  }
  if (file.size > MAX_CORPUS_ARTIFACT_BYTES) {
    return {
      status: "error",
      message: "Artifact uploads are limited to 3 MB.",
    };
  }
  try {
    const { accessToken } = await dashboardAuth();
    if (!accessToken)
      return {
        status: "error",
        message: "Your session expired. Sign in again.",
      };
    const bytes = Buffer.from(await file.arrayBuffer());
    const digest = `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
    const result = await createControlPlane(accessToken).prepareCorpusUpload({
      sha256: digest,
      size_bytes: file.size,
      content_type: file.type || "application/octet-stream",
    });
    const response = await fetch(result.upload_url, {
      method: "PUT",
      headers: result.headers,
      body: bytes,
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`Object storage returned ${response.status}`);
    return {
      status: "success",
      objectKey: result.object_key,
      digest,
    };
  } catch {
    return {
      status: "error",
      message: "Artifact upload failed. Retry the file in a moment.",
    };
  }
}

export type SpecDraftState = MutationState & {
  source?: "model" | "fallback";
  responseId?: string | null;
  model?: string;
  promptVersion?: string;
  draft?: SpecDraft;
};

export type ModelAdvisoryState = MutationState & {
  role?: "behavior_clusters" | "tier_proposals" | "replay_priorities" | "impact_explanations";
  result?: Record<string, unknown>;
};

export async function runModelAdvisoryAction(
  _previous: ModelAdvisoryState,
  formData: FormData,
): Promise<ModelAdvisoryState> {
  let entityIds: unknown = [];
  try {
    entityIds = JSON.parse(String(formData.get("entity_ids") ?? "[]"));
  } catch {
    // Zod returns the user-facing validation error below.
  }
  const parsed = z
    .object({
      role: z.enum([
        "behavior_clusters",
        "tier_proposals",
        "replay_priorities",
        "impact_explanations",
      ]),
      entityIds: z.array(z.string().uuid()).min(1).max(100),
    })
    .safeParse({ role: formData.get("role"), entityIds });
  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? "No receipt-backed entities are available.",
    };
  }
  try {
    const { accessToken } = await dashboardAuth();
    if (!accessToken)
      return {
        status: "error",
        message: "Your session expired. Sign in again.",
      };
    const response = await createControlPlane(accessToken).runModelAdvisory(
      parsed.data.role,
      parsed.data.entityIds,
    );
    return {
      status: "success",
      message: "Advisory result generated from redacted, receipt-bound evidence.",
      role: parsed.data.role,
      result: response.result as Record<string, unknown>,
    };
  } catch (error) {
    return {
      status: "error",
      message: actionError("Model advisory could not be generated", error),
    };
  }
}

export async function pinAssertionAction(
  _previous: MutationState,
  formData: FormData,
): Promise<MutationState> {
  const parsed = assertionInputSchema.safeParse({
    behavior_id: formData.get("behavior_id"),
    claim_id: formData.get("claim_id") || undefined,
    reason: formData.get("reason"),
    expires_at: formData.get("expires_at"),
  });
  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? "Assertion input is invalid.",
    };
  }
  try {
    const { accessToken } = await dashboardAuth();
    if (!accessToken) {
      return {
        status: "error",
        message: "Your session expired. Sign in again before pinning.",
      };
    }
    const assertion = await createControlPlane(accessToken).pinAssertion({
      behavior_id: parsed.data.behavior_id,
      claim_id: parsed.data.claim_id,
      reason: parsed.data.reason,
      expires_at: `${parsed.data.expires_at}T23:59:59.000Z`,
    });
    revalidatePath("/app");
    return {
      status: "success",
      message: `Assertion ${assertion.id.slice(0, 8)} pinned and added to replay enforcement.`,
    };
  } catch (error) {
    return {
      status: "error",
      message: actionError("Assertion could not be pinned", error),
    };
  }
}

export async function resolveAssertionAction(
  _previous: MutationState,
  formData: FormData,
): Promise<MutationState> {
  const resolution = formData.get("resolution");
  const parsed = assertionResolutionSchema.safeParse({
    assertion_id: formData.get("assertion_id"),
    resolution,
    reason: formData.get("reason"),
    ...(resolution === "extend" ? { expires_at: formData.get("resolution_date") } : {}),
    ...(resolution === "schedule_break" ? { break_at: formData.get("resolution_date") } : {}),
  });
  if (!parsed.success)
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? "Invalid resolution.",
    };

  try {
    const { accessToken } = await dashboardAuth();
    if (!accessToken)
      return {
        status: "error",
        message: "Your session expired. Sign in again.",
      };
    const body =
      parsed.data.resolution === "extend"
        ? {
            resolution: parsed.data.resolution,
            reason: parsed.data.reason,
            expires_at: `${parsed.data.expires_at}T23:59:59.000Z`,
          }
        : parsed.data.resolution === "schedule_break"
          ? {
              resolution: parsed.data.resolution,
              reason: parsed.data.reason,
              break_at: `${parsed.data.break_at}T12:00:00.000Z`,
            }
          : { resolution: parsed.data.resolution, reason: parsed.data.reason };
    await createControlPlane(accessToken).resolveAssertion(parsed.data.assertion_id, body);
    revalidatePath("/app");
    return {
      status: "success",
      message:
        parsed.data.resolution === "extend"
          ? "Assertion expiry extended and replay enforcement rescheduled."
          : parsed.data.resolution === "schedule_break"
            ? "Break scheduled; replay enforcement remains active until the effective date."
            : "Assertion resolution recorded in the audit trail.",
    };
  } catch (error) {
    return {
      status: "error",
      message: actionError("Assertion could not be resolved", error),
    };
  }
}

export async function overrideClaimAction(
  _previous: MutationState,
  formData: FormData,
): Promise<MutationState> {
  const parsed = claimOverrideSchema.safeParse({
    claim_id: formData.get("claim_id"),
    tier: formData.get("tier"),
    reason: formData.get("reason"),
  });
  if (!parsed.success)
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? "Invalid override.",
    };
  try {
    const { accessToken } = await dashboardAuth();
    if (!accessToken)
      return {
        status: "error",
        message: "Your session expired. Sign in again.",
      };
    const result = await createControlPlane(accessToken).overrideDependencyClaim(
      parsed.data.claim_id,
      {
        tier: parsed.data.tier === "automatic" ? null : parsed.data.tier,
        reason: parsed.data.reason,
      },
    );
    revalidatePath("/app");
    return {
      status: "success",
      message: result.human_override_tier
        ? `Evidence tier overridden to ${result.effective_tier}.`
        : `Human override cleared; automatic ${result.effective_tier} tier restored.`,
    };
  } catch (error) {
    return {
      status: "error",
      message: actionError("Claim tier could not be updated", error),
    };
  }
}

export async function updatePolicyAction(
  _previous: MutationState,
  formData: FormData,
): Promise<MutationState> {
  const parsed = policyInputSchema.safeParse({
    version: formData.get("version"),
    t1_outcome: formData.get("t1_outcome"),
    t2_outcome: formData.get("t2_outcome"),
    t3_outcome: formData.get("t3_outcome"),
  });
  if (!parsed.success)
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? "Invalid policy.",
    };
  try {
    const { accessToken } = await dashboardAuth();
    if (!accessToken)
      return {
        status: "error",
        message: "Your session expired. Sign in again.",
      };
    const policy = await createControlPlane(accessToken).updatePolicy({
      expected_version: parsed.data.version,
      block_tiers: parsed.data.t1_outcome === "block" ? ["T1"] : [],
      warn_tiers: [
        ...(parsed.data.t1_outcome === "warn" ? (["T1"] as const) : []),
        ...(parsed.data.t2_outcome === "warn" ? (["T2"] as const) : []),
        ...(parsed.data.t3_outcome === "warn" ? (["T3"] as const) : []),
      ],
    });
    revalidatePath("/app");
    return {
      status: "success",
      message: `Policy version ${policy.version} is now active.`,
    };
  } catch (error) {
    return {
      status: "error",
      message: actionError("Policy could not be updated", error),
    };
  }
}

export async function createReplayCorpusAction(
  _previous: MutationState,
  formData: FormData,
): Promise<MutationState> {
  const parsed = createCorpusSchema.safeParse({
    version: formData.get("version"),
    digest: formData.get("digest"),
    object_key: formData.get("object_key"),
    fixture_digest: formData.get("fixture_digest"),
    fixture_object_key: formData.get("fixture_object_key"),
    stubs_object_key: formData.get("stubs_object_key") || undefined,
  });
  if (!parsed.success)
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? "Invalid corpus.",
    };
  try {
    const { accessToken } = await dashboardAuth();
    if (!accessToken)
      return {
        status: "error",
        message: "Your session expired. Sign in again.",
      };
    const corpus = await createControlPlane(accessToken).createReplayCorpus(parsed.data);
    revalidatePath("/app");
    return {
      status: "success",
      message: `Draft corpus ${corpus.version} created.`,
    };
  } catch (error) {
    return {
      status: "error",
      message: actionError("Corpus could not be created", error),
    };
  }
}

export async function addReplayCorpusItemAction(
  _previous: MutationState,
  formData: FormData,
): Promise<MutationState> {
  const parsed = createCorpusItemSchema.safeParse({
    corpus_id: formData.get("corpus_id"),
    case_id: formData.get("case_id"),
    coverage_class: formData.get("coverage_class"),
    object_key: formData.get("object_key"),
    digest: formData.get("digest"),
    priority: formData.get("priority"),
  });
  if (!parsed.success)
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? "Invalid case.",
    };
  try {
    const { accessToken } = await dashboardAuth();
    if (!accessToken)
      return {
        status: "error",
        message: "Your session expired. Sign in again.",
      };
    const { corpus_id, ...item } = parsed.data;
    await createControlPlane(accessToken).addCorpusItem(corpus_id, {
      ...item,
      operation_id: null,
      consumer_id: null,
      enabled: true,
      request_metadata: {},
    });
    revalidatePath("/app");
    return {
      status: "success",
      message: `Case ${item.case_id} added to the draft corpus.`,
    };
  } catch (error) {
    return {
      status: "error",
      message: actionError("Corpus case could not be added", error),
    };
  }
}

export async function updateReplayCorpusStatusAction(
  _previous: MutationState,
  formData: FormData,
): Promise<MutationState> {
  const parsed = updateCorpusStatusSchema.safeParse({
    corpus_id: formData.get("corpus_id"),
    curation_status: formData.get("curation_status"),
  });
  if (!parsed.success)
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? "Invalid status.",
    };
  try {
    const { accessToken } = await dashboardAuth();
    if (!accessToken)
      return {
        status: "error",
        message: "Your session expired. Sign in again.",
      };
    const corpus = await createControlPlane(accessToken).updateReplayCorpus(parsed.data.corpus_id, {
      curation_status: parsed.data.curation_status,
    });
    revalidatePath("/app");
    return {
      status: "success",
      message: `Corpus is now ${corpus.curation_status}.`,
    };
  } catch (error) {
    return {
      status: "error",
      message: actionError("Corpus status could not be updated", error),
    };
  }
}

export async function draftSpecAction(
  _previous: SpecDraftState,
  formData: FormData,
): Promise<SpecDraftState> {
  const assertionId = z.string().uuid().safeParse(formData.get("assertion_id"));
  if (!assertionId.success) return { status: "error", message: "Select a valid assertion first." };
  try {
    const { accessToken } = await dashboardAuth();
    if (!accessToken) {
      return {
        status: "error",
        message: "Your session expired. Sign in again before drafting a spec change.",
      };
    }
    const response = await fetch(
      `${controlPlaneBaseUrl}/v1/assertions/${assertionId.data}/spec-draft`,
      {
        method: "POST",
        headers: {
          accept: "application/json",
          authorization: `Bearer ${accessToken}`,
        },
        cache: "no-store",
        signal: AbortSignal.timeout(30_000),
      },
    );
    if (!response.ok) throw new Error(`Control plane returned ${response.status}`);
    const result = specDraftResponseSchema.parse(await response.json());
    return {
      status: "success",
      message: `Spec draft generated from ${result.source} evidence processing.`,
      source: result.source,
      responseId: result.response_id,
      model: result.model,
      promptVersion: result.prompt_version,
      draft: result.draft,
    };
  } catch (error) {
    return {
      status: "error",
      message: actionError("Spec draft could not be generated", error),
    };
  }
}

function actionError(prefix: string, error: unknown) {
  const detail =
    error instanceof Error
      ? error.message.replace(/[\r\n]+/g, " ").slice(0, 180)
      : "Control plane request failed";
  return `${prefix}. ${detail}. Retry after checking the control plane.`;
}
