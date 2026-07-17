import { spawn } from "node:child_process";
import { createHash, createPrivateKey, createPublicKey, randomBytes } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createInterface } from "node:readline";
import { pathToFileURL } from "node:url";
import { createGunzip } from "node:zlib";

const root = resolve(import.meta.dirname, "..");
const organizationId = "00000000-0000-4000-8000-000000000001";
const agentId = "00000000-0000-4000-8000-000000000201";
const policyId = "00000000-0000-4000-8000-000000000091";
const project = "hyrum-acceptance";
const controlPlanePort = 4400;
const controlPlaneUrl = `http://127.0.0.1:${controlPlanePort}`;
const postgresPort = process.env.HYRUM_ACCEPTANCE_POSTGRES_PORT ?? "55436";
const minioApiPort = process.env.HYRUM_ACCEPTANCE_MINIO_API_PORT ?? "19000";
const minioConsolePort = process.env.HYRUM_ACCEPTANCE_MINIO_CONSOLE_PORT ?? "19001";
const databaseUrl = `postgres://hyrum:hyrum@127.0.0.1:${postgresPort}/hyrum`;
const reportPath = resolve(root, "tmp/demo-acceptance-report.json");
const operationTemplateArgs = [
  "GET /products",
  "GET /products/{id}",
  "GET /orders/{id}",
  "GET /customers/{id}",
  "GET /inventory/{id}",
  "GET /search",
  "GET /discounts/{code}",
  "POST /checkout",
].flatMap((template) => ["-operation-template", template]);
const limitations = [
  "The Go agent processes all 50,000 fixture events twice; authenticated HTTP ingestion submits a representative 200-event slice covering T1, T2, T3, and hard-negative traffic.",
  "WorkOS human authentication is not exercised because the acceptance run has no external WorkOS credentials; machine authentication and tenant scoping are exercised.",
  "OpenAI is not called: model output is advisory and no external API key is required for deterministic capture, replay, or gate decisions.",
  "GitHub and Slack are not contacted; the PRD permits local integration fixtures, which remain covered by their package tests rather than this live acceptance run.",
];

export function buildMachineToken(prefix, secret) {
  if (!/^[A-Za-z0-9]{8,64}$/.test(prefix) || !/^[A-Za-z0-9_-]{16,}$/.test(secret)) {
    throw new Error("Invalid machine-token components");
  }
  return `hyrum_${prefix}_${secret}`;
}

export function selectClaim(claims, tier, kind, path) {
  const claim = claims.find(
    (candidate) => candidate.tier === tier && candidate.kind === kind && candidate.path === path,
  );
  if (!claim) throw new Error(`Missing ${tier} ${kind} ${path} claim after capture ingestion`);
  return claim.id;
}

export function summarizeReplay(report, response) {
  const stableCaseCount = report.results.filter(
    (result) => result.stable && !result.quarantined,
  ).length;
  return {
    base_image_digest: report.base_image_digest,
    candidate_image_digest: report.candidate_image_digest,
    corpus_digest: report.corpus_digest,
    fixture_digest: report.fixture_digest,
    mask_digest: report.mask_digest,
    runner_version: report.runner_version,
    policy_id: report.policy_id,
    policy_version: report.policy_version,
    repeated_runs: report.runs,
    case_count: report.results.length,
    stable_case_count: stableCaseCount,
    quarantined_case_count: report.results.length - stableCaseCount,
    gate_outcome: response.outcome,
    signature_algorithm: report.signature?.algorithm,
    signature_verified_by_control_plane: response.verified,
    replay_run_id: response.replay_run_id,
  };
}

function exited(child) {
  return new Promise((resolveExit, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => resolveExit({ code, signal }));
  });
}

async function run(command, args, options = {}) {
  const child = spawn(command, args, {
    cwd: root,
    env: { ...process.env, ...options.env },
    stdio: ["pipe", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => {
    stdout += chunk.toString();
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });
  if (options.input) child.stdin.end(options.input);
  else child.stdin.end();
  const result = await exited(child);
  const allowedExitCodes = options.allowedExitCodes ?? [0];
  if (!allowedExitCodes.includes(result.code)) {
    const detail = stderr.trim().slice(-1_500);
    throw new Error(`${command} ${args.join(" ")} exited ${result.code}: ${detail}`);
  }
  return { ...result, stdout: stdout.trim(), stderr: stderr.trim() };
}

const compose = (args, options = {}) =>
  run("docker", ["compose", "--project-name", project, ...args], {
    ...options,
    env: {
      HYRUM_POSTGRES_PORT: postgresPort,
      HYRUM_MINIO_API_PORT: minioApiPort,
      HYRUM_MINIO_CONSOLE_PORT: minioConsolePort,
      ...options.env,
    },
  });

async function psql(sql) {
  const result = await compose(
    [
      "exec",
      "-T",
      "postgres",
      "psql",
      "-qAt",
      "-v",
      "ON_ERROR_STOP=1",
      "-U",
      "hyrum",
      "-d",
      "hyrum",
    ],
    { input: sql },
  );
  return result.stdout.split("\n").filter(Boolean).at(-1) ?? "";
}

async function waitForHealth(child) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (child.exitCode !== null) {
      throw new Error(
        `Control plane exited before becoming healthy: ${child.diagnostic?.trim().slice(-1_500) ?? "no diagnostic output"}`,
      );
    }
    try {
      const response = await fetch(`${controlPlaneUrl}/health`, {
        signal: AbortSignal.timeout(1_000),
      });
      if (response.ok) return;
    } catch {
      // Startup races are expected while Fastify opens its listener.
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  }
  throw new Error("Control plane did not become healthy within 15 seconds");
}

async function stopChild(child) {
  if (!child || child.exitCode !== null) return;
  child.kill("SIGTERM");
  const stopped = await Promise.race([
    exited(child).then(() => true),
    new Promise((resolveWait) => setTimeout(() => resolveWait(false), 5_000)),
  ]);
  if (!stopped && child.exitCode === null) child.kill("SIGKILL");
}

async function apiPost(path, token, body) {
  const response = await fetch(`${controlPlaneUrl}${path}`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(
      `${path} returned ${response.status}: ${payload.detail ?? payload.error ?? "request failed"}`,
    );
  }
  return payload;
}

async function firstFixtureEvents(count) {
  const input = createReadStream(resolve(root, "fixtures/demo/traffic-50000.ndjson.gz")).pipe(
    createGunzip(),
  );
  const lines = createInterface({ input, crlfDelay: Number.POSITIVE_INFINITY });
  const events = [];
  for await (const line of lines) {
    events.push(line);
    if (events.length === count) {
      input.destroy();
      break;
    }
  }
  if (events.length !== count) throw new Error(`Expected ${count} fixture events`);
  return `${events.join("\n")}\n`;
}

function ed25519PublicKeyPem(seedText) {
  const seed = Buffer.from(seedText);
  const prefix = Buffer.from("302e020100300506032b657004220420", "hex");
  const privateKey = createPrivateKey({
    key: Buffer.concat([prefix, seed]),
    format: "der",
    type: "pkcs8",
  });
  return createPublicKey(privateKey).export({ format: "pem", type: "spki" }).toString();
}

async function inspectImage(service) {
  const container = (await compose(["ps", "--quiet", service])).stdout;
  if (!container) throw new Error(`Missing ${service} container`);
  return (await run("docker", ["inspect", "--format", "{{.Image}}", container])).stdout;
}

async function runAcceptance() {
  if (Number(process.versions.node.split(".")[0]) !== 22) {
    throw new Error(`Node 22 is required; received ${process.version}`);
  }
  await mkdir(resolve(root, "tmp"), { recursive: true });
  const result = {
    version: "1.0.0",
    status: "running",
    generated_at: new Date().toISOString(),
    phases: {},
    limitations,
  };
  let controlPlane;
  try {
    await compose(["down", "--volumes", "--remove-orphans"], { allowedExitCodes: [0] });
    await run("pnpm", ["demo:seed-traffic"]);
    await run("pnpm", ["demo:evaluate"]);
    const manifest = JSON.parse(
      await readFile(resolve(root, "fixtures/demo/manifest.json"), "utf8"),
    );
    const evaluation = JSON.parse(
      await readFile(resolve(root, "fixtures/demo/evaluation-report.json"), "utf8"),
    );
    result.phases.fixture = {
      record_count: manifest.record_count,
      uncompressed_sha256: manifest.uncompressed_sha256,
      deterministic_runs: evaluation.deterministic_runs,
      output_sha256: evaluation.output_sha256,
      tier1: evaluation.tier1,
      tier2: evaluation.tier2,
      hard_negative_violations: evaluation.hard_negative_violations,
    };

    await compose([
      "up",
      "--build",
      "--detach",
      "--wait",
      "postgres",
      "minio",
      "demo-api-base",
      "demo-api-candidate",
    ]);
    await compose(["run", "--rm", "--no-deps", "minio-init"]);
    await run("pnpm", ["db:migrate"], { env: { DATABASE_URL: databaseUrl } });

    const tokenPrefix = randomBytes(6).toString("hex");
    const token = buildMachineToken(tokenPrefix, randomBytes(24).toString("base64url"));
    const legacyTokenHash = `sha256:${createHash("sha256").update(token).digest("hex")}`;
    const signingSeed = randomBytes(16).toString("hex");
    const publicKeyPem = ed25519PublicKeyPem(signingSeed);
    await psql(`
      SELECT set_config('app.organization_id', '${organizationId}', false);
      INSERT INTO organizations (id, workos_organization_id, name)
      VALUES ('${organizationId}', 'org_demo_acceptance', 'Hyrum demo acceptance')
      ON CONFLICT (id) DO UPDATE SET active = true;
      INSERT INTO agents (id, organization_id, name, token_prefix, token_hash, scopes, signing_public_key)
      VALUES (
        '${agentId}', '${organizationId}', 'demo acceptance agent', '${tokenPrefix}',
        '${legacyTokenHash}', ARRAY['capture:write', 'replay:write'], $pem$${publicKeyPem}$pem$
      )
      ON CONFLICT (id) DO UPDATE SET
        token_prefix = EXCLUDED.token_prefix,
        token_hash = EXCLUDED.token_hash,
        scopes = EXCLUDED.scopes,
        signing_public_key = EXCLUDED.signing_public_key,
        revoked_at = NULL;
      INSERT INTO gate_policies (id, organization_id, version, block_tiers, warn_tiers, active)
      VALUES ('${policyId}', '${organizationId}', 1, ARRAY['T1'], ARRAY['T2'], true)
      ON CONFLICT (id) DO UPDATE SET
        version = EXCLUDED.version,
        block_tiers = EXCLUDED.block_tiers,
        warn_tiers = EXCLUDED.warn_tiers,
        active = true;
    `);

    controlPlane = spawn(
      "pnpm",
      ["--filter", "@hyrum/control-plane", "exec", "tsx", "src/server.ts"],
      {
        cwd: root,
        env: {
          ...process.env,
          NODE_ENV: "test",
          LOG_LEVEL: "warn",
          CONTROL_PLANE_HOST: "127.0.0.1",
          CONTROL_PLANE_PORT: String(controlPlanePort),
          DATABASE_URL: databaseUrl,
          OBJECT_STORAGE_ENDPOINT: `http://127.0.0.1:${minioApiPort}`,
          OBJECT_STORAGE_BUCKET: "hyrum-development",
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    controlPlane.diagnostic = "";
    for (const stream of [controlPlane.stdout, controlPlane.stderr]) {
      stream.on("data", (chunk) => {
        controlPlane.diagnostic += chunk.toString();
      });
    }
    await waitForHealth(controlPlane);

    const representativeInput = await firstFixtureEvents(200);
    const captured = await run(
      "./tmp/hyrum-agent",
      ["-organization-id", organizationId, "-input", "-", "-output", "-", ...operationTemplateArgs],
      {
        env: {
          HYRUM_MASTER_KEY: createHash("sha256")
            .update("hyrum public demo fixture key")
            .digest("hex")
            .slice(0, 32),
        },
        input: representativeInput,
      },
    );
    const captureEvents = captured.stdout.split("\n").filter(Boolean).map(JSON.parse);
    const captureResponse = await apiPost("/v1/capture/batches", token, {
      batch_id: "demo-acceptance-representative-v2",
      events: captureEvents,
    });
    if (captureResponse.rejected_count !== 0 || captureResponse.accepted_count !== 200) {
      const failureSummary = captureResponse.results
        .filter((item) => item.status === "rejected")
        .slice(0, 3)
        .map((item) => `${item.code ?? "rejected"}: ${item.error ?? "no detail"}`)
        .join("; ");
      throw new Error(
        `Capture ingestion accepted ${captureResponse.accepted_count}/200 and rejected ${captureResponse.rejected_count}: ${failureSummary}; control plane: ${controlPlane.diagnostic.trim().slice(0, 2_500)}`,
      );
    }
    const claims = JSON.parse(
      await psql(`
        WITH configured AS (
          SELECT set_config('app.organization_id', '${organizationId}', false)
        )
        SELECT coalesce(json_agg(json_build_object(
          'id', dc.id,
          'tier', dc.tier,
          'kind', bd.kind,
          'path', bd.fingerprint->>'path'
        ) ORDER BY dc.tier, dc.id), '[]'::json)
        FROM dependency_claims dc
        JOIN behavior_definitions bd ON bd.id = dc.behavior_id
        CROSS JOIN configured
        WHERE dc.organization_id = '${organizationId}' AND dc.state = 'active';
      `),
    );
    const tierCounts = claims.reduce((counts, claim) => {
      counts[claim.tier] = (counts[claim.tier] ?? 0) + 1;
      return counts;
    }, {});
    const tokenRotated =
      (await psql(`
        WITH configured AS (SELECT set_config('app.organization_id', '${organizationId}', false))
        SELECT token_hash LIKE '$argon2id$%' FROM agents CROSS JOIN configured WHERE id = '${agentId}';
      `)) === "t";
    if (!tokenRotated)
      throw new Error("Machine token was not upgraded to Argon2id after authentication");
    result.phases.capture_to_ledger = {
      submitted_event_count: captureEvents.length,
      accepted_count: captureResponse.accepted_count,
      rejected_count: captureResponse.rejected_count,
      active_claim_count: claims.length,
      claims_by_tier: tierCounts,
      machine_token_hash: "argon2id",
    };

    const baseImageDigest = await inspectImage("demo-api-base");
    const candidateImageDigest = await inspectImage("demo-api-candidate");
    if (baseImageDigest === candidateImageDigest) {
      throw new Error("Base and candidate demo images must have distinct immutable digests");
    }
    const replayConfig = JSON.parse(
      await readFile(resolve(root, "demo/replay-config.json"), "utf8"),
    );
    replayConfig.signing_key_id = agentId;
    replayConfig.base_image_digest = baseImageDigest;
    replayConfig.candidate_image_digest = candidateImageDigest;
    replayConfig.fixture_digest = `sha256:${createHash("sha256")
      .update(await readFile(resolve(root, "demo/api/server.mjs")))
      .digest("hex")}`;
    replayConfig.policy_id = policyId;
    replayConfig.policy_version = 1;
    const claimIds = {
      T1: selectClaim(claims, "T1", "shape", "$.next_cursor"),
      T2: selectClaim(claims, "T2", "error", "$error"),
      T3: selectClaim(claims, "T3", "shape", "$.legacy_id"),
    };
    const claimIdsByCase = {
      "pagination-cursor": claimIds.T1,
      "discount-error-template": claimIds.T2,
      "legacy-id-exposure": claimIds.T3,
    };
    for (const item of replayConfig.corpus) {
      for (const claim of item.claims) claim.claim_id = claimIdsByCase[item.case_id];
    }
    await writeFile(
      resolve(root, "tmp/demo-acceptance-replay-config.json"),
      `${JSON.stringify(replayConfig, null, 2)}\n`,
    );
    await run("go", ["build", "-o", "tmp/hyrum-replay", "./cmd/hyrum-replay"]);
    await run(
      "./tmp/hyrum-replay",
      [
        "-config",
        "tmp/demo-acceptance-replay-config.json",
        "-output",
        "tmp/demo-acceptance-replay-report.json",
      ],
      { env: { HYRUM_REPORT_SIGNING_KEY: signingSeed } },
    );
    const replayReport = JSON.parse(
      await readFile(resolve(root, "tmp/demo-acceptance-replay-report.json"), "utf8"),
    );
    const replayResponse = await apiPost("/v1/replay/reports", token, replayReport);
    if (!replayResponse.verified || replayResponse.outcome !== "block") {
      throw new Error("Control plane did not verify and block the signed T1 replay report");
    }
    const retryResponse = await apiPost("/v1/replay/reports", token, replayReport);
    if (retryResponse.replay_run_id !== replayResponse.replay_run_id) {
      throw new Error("Identical replay report retry created a second replay run");
    }
    const expectedDeltaCount = replayReport.results.reduce(
      (count, replayCase) => count + replayCase.deltas.length,
      0,
    );
    const persistedReplay = JSON.parse(
      await psql(`
        WITH configured AS (SELECT set_config('app.organization_id', '${organizationId}', false))
        SELECT json_build_object(
          'delta_count', (SELECT count(*) FROM replay_deltas, configured WHERE replay_run_id = '${replayResponse.replay_run_id}'),
          'assertion_result_count', (SELECT count(*) FROM replay_assertion_results, configured WHERE replay_run_id = '${replayResponse.replay_run_id}'),
          'decision_count', (SELECT count(*) FROM gate_decisions, configured WHERE replay_run_id = '${replayResponse.replay_run_id}'),
          'progress_count', (SELECT count(*) FROM progress_events, configured WHERE resource_id = '${replayResponse.replay_run_id}' AND topic = 'replay.report_ingested')
        );
      `),
    );
    if (
      Number(persistedReplay.delta_count) !== expectedDeltaCount ||
      Number(persistedReplay.assertion_result_count) !== replayReport.assertion_results.length ||
      Number(persistedReplay.decision_count) !== 1 ||
      Number(persistedReplay.progress_count) !== 1
    ) {
      throw new Error(`Replay retry was not idempotent: ${JSON.stringify(persistedReplay)}`);
    }
    result.phases.differential_replay = {
      ...summarizeReplay(replayReport, replayResponse),
      retry_idempotent: true,
    };
    result.status = "passed";
    result.completed_at = new Date().toISOString();
    await writeFile(reportPath, `${JSON.stringify(result, null, 2)}\n`);
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    result.status = "failed";
    result.completed_at = new Date().toISOString();
    result.error = error instanceof Error ? error.message : "Unknown acceptance failure";
    await writeFile(reportPath, `${JSON.stringify(result, null, 2)}\n`);
    throw error;
  } finally {
    await stopChild(controlPlane);
    await compose(["down", "--volumes", "--remove-orphans"], { allowedExitCodes: [0] }).catch(
      () => {},
    );
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  await runAcceptance();
}
