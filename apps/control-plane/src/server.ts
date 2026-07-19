import { parseRuntimeEnv } from "@hyrum/env";
import { startTelemetry, stopTelemetry } from "./telemetry";

async function main() {
  const env = parseRuntimeEnv();
  startTelemetry(env.OTEL_EXPORTER_OTLP_ENDPOINT);
  const { buildApp } = await import("./app");
  const app = await buildApp({ env });

  const shutdown = async (signal: string) => {
    app.log.info({ signal }, "shutting down");
    await app.close();
    await stopTelemetry();
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));

  await app.listen({ host: env.CONTROL_PLANE_HOST, port: env.CONTROL_PLANE_PORT });
}

if (!process.argv.includes("--verify-bundle")) await main();
