import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";

const bundles = ["apps/control-plane/dist/server.js", "apps/worker/dist/index.js"];

for (const bundle of bundles) {
  const source = await readFile(bundle, "utf8");
  if (/from\s+["']@hyrum\//.test(source) || /import\(["']@hyrum\//.test(source)) {
    throw new Error(`${bundle} still imports an unbuilt workspace package`);
  }
  const smoke = spawnSync(process.execPath, [bundle, "--verify-bundle"], { encoding: "utf8" });
  if (smoke.status !== 0) {
    throw new Error(`${bundle} failed to load:\n${smoke.stderr.trim()}`);
  }
}

process.stdout.write(`Verified ${bundles.length} production bundles are workspace-closed.\n`);
