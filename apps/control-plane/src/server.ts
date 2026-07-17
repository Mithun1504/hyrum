import { parseRuntimeEnv } from "@hyrum/env";
import { buildApp } from "./app";

async function main() {
  const env = parseRuntimeEnv();
  const app = await buildApp({ env });

  const shutdown = async (signal: string) => {
    app.log.info({ signal }, "shutting down");
    await app.close();
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));

  await app.listen({ host: env.CONTROL_PLANE_HOST, port: env.CONTROL_PLANE_PORT });
}

if (!process.argv.includes("--verify-bundle")) await main();
