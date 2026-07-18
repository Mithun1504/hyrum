import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const rootEnvironment = resolve(webRoot, "../../.env.local");

if (existsSync(rootEnvironment)) {
  process.loadEnvFile(rootEnvironment);
}

const next = spawn(
  process.execPath,
  [resolve(webRoot, "node_modules/next/dist/bin/next"), "dev", ...process.argv.slice(2)],
  {
    cwd: webRoot,
    env: process.env,
    stdio: "inherit",
  },
);

next.once("exit", (code) => {
  process.exit(code ?? 1);
});
