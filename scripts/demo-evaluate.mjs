import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createInterface } from "node:readline";
import { createGunzip } from "node:zlib";

const root = resolve(import.meta.dirname, "..");
const organizationId = "00000000-0000-4000-8000-000000000001";
const inputPath = resolve(root, "fixtures/demo/traffic-50000.ndjson.gz");
const reportPath = resolve(root, "fixtures/demo/evaluation-report.json");
const fixtureKey = createHash("sha256")
  .update("hyrum public demo fixture key")
  .digest("hex")
  .slice(0, 32);
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

const exited = (child) =>
  new Promise((resolveExit, reject) => {
    child.once("error", reject);
    child.once("exit", resolveExit);
  });

async function buildAgent() {
  await mkdir(resolve(root, "tmp"), { recursive: true });
  const child = spawn("go", ["build", "-o", "tmp/hyrum-agent", "./cmd/hyrum-agent"], {
    cwd: root,
    stdio: "inherit",
  });
  if ((await exited(child)) !== 0) throw new Error("Could not build the capture agent");
}

function counters() {
  return { tp: 0, fp: 0, fn: 0, tn: 0 };
}

function observe(counter, expected, predicted) {
  if (expected && predicted) counter.tp += 1;
  else if (!expected && predicted) counter.fp += 1;
  else if (expected) counter.fn += 1;
  else counter.tn += 1;
}

function metrics(counter) {
  const precision = counter.tp / Math.max(1, counter.tp + counter.fp);
  const recall = counter.tp / Math.max(1, counter.tp + counter.fn);
  return {
    ...counter,
    precision,
    recall,
    f1: (2 * precision * recall) / Math.max(Number.EPSILON, precision + recall),
  };
}

function expectedTier1(offset) {
  return offset === 0 || offset === 6;
}

async function runAgent(collectMetrics) {
  const agent = spawn(
    "./tmp/hyrum-agent",
    ["-organization-id", organizationId, "-input", "-", "-output", "-", ...operationTemplateArgs],
    {
      cwd: root,
      env: { ...process.env, HYRUM_MASTER_KEY: fixtureKey },
      stdio: ["pipe", "pipe", "inherit"],
    },
  );
  createReadStream(inputPath).pipe(createGunzip()).pipe(agent.stdin);
  const digest = createHash("sha256");
  const tier1 = counters();
  const tier2 = counters();
  let hardNegativeViolations = 0;
  let recordCount = 0;
  const lines = createInterface({ input: agent.stdout, crlfDelay: Number.POSITIVE_INFINITY });
  for await (const line of lines) {
    digest.update(`${line}\n`);
    if (collectMetrics) {
      const record = JSON.parse(line);
      const evidence = Array.isArray(record.evidence) ? record.evidence : [];
      const offset = recordCount % 10;
      const predictsT1 = evidence.some(({ tier }) => tier === "T1");
      const predictsT2 = evidence.some(({ tier }) => tier === "T2");
      observe(tier1, expectedTier1(offset), predictsT1);
      observe(tier2, offset === 2, predictsT2);
      if (offset === 5 && (predictsT1 || predictsT2)) hardNegativeViolations += 1;
    }
    recordCount += 1;
  }
  if ((await exited(agent)) !== 0) throw new Error("Capture agent evaluation failed");
  return {
    recordCount,
    outputSha256: digest.digest("hex"),
    ...(collectMetrics
      ? { tier1: metrics(tier1), tier2: metrics(tier2), hardNegativeViolations }
      : {}),
  };
}

await buildAgent();
const first = await runAgent(true);
const second = await runAgent(false);
if (first.recordCount !== 50_000 || second.recordCount !== 50_000) {
  throw new Error(
    `Expected 50,000 records, received ${first.recordCount} and ${second.recordCount}`,
  );
}
if (first.outputSha256 !== second.outputSha256)
  throw new Error("Capture output is not deterministic");
if (
  first.tier1.precision < 0.95 ||
  first.tier1.recall < 0.95 ||
  first.tier2.precision < 0.95 ||
  first.tier2.recall < 0.95 ||
  first.hardNegativeViolations !== 0
) {
  throw new Error("Demo evidence evaluation did not meet its acceptance threshold");
}

const report = {
  version: "1.0.0",
  corpus: "fixtures/demo/traffic-50000.ndjson.gz",
  record_count: first.recordCount,
  deterministic_runs: 2,
  output_sha256: first.outputSha256,
  replay_stability_target: 0.99,
  tier1: first.tier1,
  tier2: first.tier2,
  hard_negative_violations: first.hardNegativeViolations,
};
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(report)}\n`);
