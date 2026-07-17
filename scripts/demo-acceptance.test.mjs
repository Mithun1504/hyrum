import assert from "node:assert/strict";
import test from "node:test";
import { buildMachineToken, selectClaim, summarizeReplay } from "./demo-acceptance.mjs";

test("buildMachineToken enforces the production token shape", () => {
  assert.equal(
    buildMachineToken("demo1234", "abcdefghijklmnop"),
    "hyrum_demo1234_abcdefghijklmnop",
  );
  assert.throws(() => buildMachineToken("short", "abcdefghijklmnop"));
});

test("selectClaim requires an exact tier, kind, and path match", () => {
  const claims = [{ id: "claim-1", tier: "T1", kind: "shape", path: "$.next_cursor" }];
  assert.equal(selectClaim(claims, "T1", "shape", "$.next_cursor"), "claim-1");
  assert.throws(() => selectClaim(claims, "T2", "shape", "$.next_cursor"));
});

test("summarizeReplay counts quarantined and unstable cases as not stable", () => {
  const summary = summarizeReplay(
    {
      base_image_digest: "sha256:base",
      candidate_image_digest: "sha256:candidate",
      corpus_digest: "corpus",
      fixture_digest: "fixture",
      mask_digest: "mask",
      runner_version: "runner",
      policy_id: "policy",
      policy_version: 1,
      runs: 3,
      results: [
        { stable: true, quarantined: false },
        { stable: true, quarantined: true },
        { stable: false, quarantined: false },
      ],
      signature: { algorithm: "ed25519" },
    },
    { verified: true, replay_run_id: "run-1", outcome: "block" },
  );
  assert.equal(summary.stable_case_count, 1);
  assert.equal(summary.quarantined_case_count, 2);
  assert.equal(summary.signature_verified_by_control_plane, true);
  assert.equal(summary.gate_outcome, "block");
});
