import { z } from "zod";
import { isoDateTimeSchema } from "./common";

export const immutableImageDigestSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/);

export const replayDeltaSchema = z
  .object({
    kind: z.enum(["shape", "ordering", "error", "status"]),
    path: z.string(),
    before: z.unknown().optional(),
    after: z.unknown().optional(),
    digest: z.string().min(1),
    matches: z.array(z.object({ claim_id: z.uuid() }).strict()),
  })
  .strict();

export const replayAssertionResultSchema = z
  .object({
    assertion_id: z.uuid(),
    behavior_id: z.uuid(),
    claim_id: z.uuid().nullable(),
    case_id: z.string().min(1),
    outcome: z.enum(["pass", "fail"]),
  })
  .strict();
export type ReplayAssertionResult = z.infer<typeof replayAssertionResultSchema>;

export const replayReportSchema = z
  .object({
    version: z.string().min(1),
    organization_id: z.uuid(),
    generated_at: isoDateTimeSchema,
    base_url: z.string().url(),
    candidate_url: z.string().url(),
    base_image_digest: immutableImageDigestSchema,
    candidate_image_digest: immutableImageDigestSchema,
    extractor_version: z.string().min(1),
    corpus_digest: immutableImageDigestSchema,
    fixture_digest: immutableImageDigestSchema,
    mask_digest: immutableImageDigestSchema,
    runner_version: z.string().min(1),
    policy_id: z.uuid(),
    policy_version: z.number().int().positive(),
    runs: z.number().int().positive(),
    results: z.array(
      z
        .object({
          case_id: z.string().min(1),
          stable: z.boolean(),
          quarantined: z.boolean(),
          deltas: z.array(replayDeltaSchema),
        })
        .strict(),
    ),
    assertion_results: z.array(replayAssertionResultSchema),
    source: z
      .object({
        github: z
          .object({
            repository_owner: z.string().min(1),
            repository_name: z.string().min(1),
            head_sha: z.string().regex(/^[a-f0-9]{7,64}$/),
            pull_request: z.number().int().positive(),
            installation_id: z.number().int().positive(),
          })
          .strict()
          .optional(),
        slack: z
          .object({ channel: z.string().regex(/^[A-Z0-9]{2,32}$/) })
          .strict()
          .optional(),
      })
      .strict()
      .refine((source) => source.github || source.slack, {
        message: "source requires github or slack context",
      })
      .optional(),
    signature: z
      .object({
        algorithm: z.enum(["ed25519"]),
        key_id: z.string().min(1),
        value: z.string().min(1),
      })
      .strict(),
  })
  .strict()
  .refine((report) => report.base_image_digest !== report.candidate_image_digest, {
    message: "base_image_digest and candidate_image_digest must differ",
    path: ["candidate_image_digest"],
  });
export type ReplayReport = z.infer<typeof replayReportSchema>;

export const replayReportResponseSchema = z.object({
  replay_run_id: z.uuid(),
  verified: z.boolean(),
  outcome: z.enum(["pass", "warn", "block"]),
});
export type ReplayReportResponse = z.infer<typeof replayReportResponseSchema>;

export const replayRunDetailResponseSchema = z
  .object({
    id: z.uuid(),
    generated_at: isoDateTimeSchema,
    base_url: z.string().url(),
    candidate_url: z.string().url(),
    base_image_digest: immutableImageDigestSchema,
    candidate_image_digest: immutableImageDigestSchema,
    extractor_version: z.string(),
    corpus_digest: immutableImageDigestSchema,
    fixture_digest: immutableImageDigestSchema,
    mask_digest: immutableImageDigestSchema,
    runner_version: z.string(),
    policy_id: z.uuid(),
    policy_version: z.number().int().positive(),
    outcome: z.enum(["pass", "warn", "block"]),
    decision: z
      .object({
        outcome: z.enum(["pass", "warn", "block"]),
        block_count: z.number().int().nonnegative(),
        warn_count: z.number().int().nonnegative(),
        note_count: z.number().int().nonnegative(),
        reasons: z.array(z.string()),
      })
      .strict(),
    deltas: z.array(
      z
        .object({
          case_id: z.string(),
          kind: z.enum(["shape", "ordering", "error", "status"]),
          path: z.string(),
          digest: z.string(),
          stable: z.boolean(),
          quarantined: z.boolean(),
          before: z.unknown().optional(),
          after: z.unknown().optional(),
          matches: z.array(z.object({ claim_id: z.uuid() }).strict()),
        })
        .strict(),
    ),
    assertion_results: z.array(replayAssertionResultSchema),
  })
  .strict()
  .refine((run) => run.base_image_digest !== run.candidate_image_digest, {
    message: "base_image_digest and candidate_image_digest must differ",
    path: ["candidate_image_digest"],
  });
export type ReplayRunDetailResponse = z.infer<typeof replayRunDetailResponseSchema>;
