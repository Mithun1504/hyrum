import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const children = [];
const imageDigestPattern = /^sha256:[a-f0-9]{64}$/;

function start(command, args, env = {}) {
  const child = spawn(command, args, {
    cwd: root,
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "inherit"],
  });
  children.push(child);
  return child;
}

async function run(command, args, env = {}) {
  const child = start(command, args, env);
  let stdout = "";
  child.stdout.on("data", (chunk) => {
    stdout += chunk.toString();
  });
  const exitCode = await exited(child);
  if (exitCode !== 0) throw new Error(`${command} ${args.join(" ")} exited ${exitCode}`);
  return stdout.trim();
}

async function stop() {
  await Promise.all(
    children.map(
      (child) =>
        new Promise((resolveStop) => {
          if (child.exitCode !== null) return resolveStop();
          child.once("exit", resolveStop);
          child.kill("SIGTERM");
        }),
    ),
  );
}

const exited = (child) => new Promise((resolveExit) => child.once("exit", resolveExit));

try {
  await run("docker", [
    "compose",
    "up",
    "--build",
    "--detach",
    "--wait",
    "demo-api-base",
    "demo-api-candidate",
  ]);
  const baseContainer = await run("docker", ["compose", "ps", "--quiet", "demo-api-base"]);
  const candidateContainer = await run("docker", [
    "compose",
    "ps",
    "--quiet",
    "demo-api-candidate",
  ]);
  const baseImageDigest = await run("docker", ["inspect", "--format", "{{.Image}}", baseContainer]);
  const candidateImageDigest = await run("docker", [
    "inspect",
    "--format",
    "{{.Image}}",
    candidateContainer,
  ]);
  if (!imageDigestPattern.test(baseImageDigest) || !imageDigestPattern.test(candidateImageDigest)) {
    throw new Error("Demo image digests must be immutable SHA-256 values");
  }
  if (baseImageDigest === candidateImageDigest) {
    throw new Error("Base and candidate demo images must have distinct immutable digests");
  }
  await mkdir(resolve(root, "tmp"), { recursive: true });
  const replayConfig = JSON.parse(await readFile(resolve(root, "demo/replay-config.json"), "utf8"));
  replayConfig.base_image_digest = baseImageDigest;
  replayConfig.candidate_image_digest = candidateImageDigest;
  replayConfig.fixture_digest = `sha256:${createHash("sha256")
    .update(await readFile(resolve(root, "demo/api/server.mjs")))
    .digest("hex")}`;
  await writeFile(
    resolve(root, "tmp/demo-replay-config.json"),
    `${JSON.stringify(replayConfig, null, 2)}\n`,
  );
  const build = start("go", ["build", "-o", "tmp/hyrum-replay", "./cmd/hyrum-replay"]);
  if ((await exited(build)) !== 0) throw new Error("Could not build the replay CLI");
  const replay = start(
    "./tmp/hyrum-replay",
    ["-config", "tmp/demo-replay-config.json", "-output", "tmp/demo-replay-report.json"],
    { HYRUM_REPORT_SIGNING_KEY: randomBytes(16).toString("hex") },
  );
  const exitCode = await exited(replay);
  if (exitCode !== 0) throw new Error(`Replay runner exited ${exitCode}`);
  const report = JSON.parse(await readFile(resolve(root, "tmp/demo-replay-report.json"), "utf8"));
  const stableCases = report.results.filter(
    (result) => result.stable && !result.quarantined,
  ).length;
  const evaluation = {
    version: report.version,
    corpus_digest: report.corpus_digest,
    fixture_digest: report.fixture_digest,
    mask_digest: report.mask_digest,
    runner_version: report.runner_version,
    policy_id: report.policy_id,
    policy_version: report.policy_version,
    image_digests_valid:
      imageDigestPattern.test(report.base_image_digest) &&
      imageDigestPattern.test(report.candidate_image_digest),
    image_digests_distinct: report.base_image_digest !== report.candidate_image_digest,
    repeated_runs: report.runs,
    case_count: report.results.length,
    stable_case_count: stableCases,
    quarantined_case_count: report.results.length - stableCases,
    stability: stableCases / report.results.length,
    signature_algorithm: report.signature?.algorithm,
    signature_present: Boolean(report.signature?.value),
  };
  await writeFile(
    resolve(root, "fixtures/demo/replay-evaluation.json"),
    `${JSON.stringify(evaluation, null, 2)}\n`,
  );
  process.stdout.write("Signed demo replay report: tmp/demo-replay-report.json\n");
} finally {
  await stop();
  const cleanup = spawn("docker", ["compose", "stop", "demo-api-base", "demo-api-candidate"], {
    cwd: root,
    stdio: "inherit",
  });
  await exited(cleanup);
}
