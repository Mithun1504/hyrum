import { spawn } from "node:child_process";

const toxiproxyApi = process.env.TOXIPROXY_API ?? "http://127.0.0.1:8474";
const proxyName = "hyrum-postgres-resilience";
const proxyPort = 18766;
const controlPlanePort = 18767;
const sourceDatabaseUrl = new URL(
  process.env.RESILIENCE_DATABASE_URL ??
    process.env.DATABASE_URL ??
    "postgresql://hyrum:hyrum@127.0.0.1:5432/hyrum",
);
const upstreamPort = Number(sourceDatabaseUrl.port || 5432);
const proxiedDatabaseUrl = new URL(sourceDatabaseUrl);
proxiedDatabaseUrl.hostname = "127.0.0.1";
proxiedDatabaseUrl.port = String(proxyPort);

await waitFor(`${toxiproxyApi}/version`, (response) => response.ok, 10_000);
await fetch(`${toxiproxyApi}/proxies/${proxyName}`, { method: "DELETE" }).catch(() => undefined);
await requiredFetch(`${toxiproxyApi}/proxies`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    name: proxyName,
    listen: `0.0.0.0:${proxyPort}`,
    upstream: `host.docker.internal:${upstreamPort}`,
  }),
});

const child = spawn("pnpm", ["--filter", "@hyrum/control-plane", "exec", "tsx", "src/server.ts"], {
  env: {
    ...process.env,
    NODE_ENV: "test",
    LOG_LEVEL: "silent",
    CONTROL_PLANE_HOST: "127.0.0.1",
    CONTROL_PLANE_PORT: String(controlPlanePort),
    DATABASE_URL: proxiedDatabaseUrl.toString(),
    DATABASE_POOL_MAX: "1",
  },
  stdio: ["ignore", "pipe", "pipe"],
});
let childOutput = "";
child.stdout.on("data", (chunk) => (childOutput += chunk.toString()));
child.stderr.on("data", (chunk) => (childOutput += chunk.toString()));

try {
  const baseUrl = `http://127.0.0.1:${controlPlanePort}`;
  await waitFor(`${baseUrl}/ready`, (response) => response.ok, 20_000);
  // nosemgrep: typescript.react.security.react-insecure-request.react-insecure-request -- loopback control plane is intentionally exercised without TLS in this local fault test
  const health = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(2_000) });
  if (!health.ok) throw new Error("liveness was not healthy before the fault");

  await requiredFetch(`${toxiproxyApi}/proxies/${proxyName}/toxics`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: "database-reset",
      type: "reset_peer",
      stream: "downstream",
      toxicity: 1,
      attributes: { timeout: 0 },
    }),
  });

  await waitFor(`${baseUrl}/ready`, (response) => response.status === 503, 8_000);
  // nosemgrep: typescript.react.security.react-insecure-request.react-insecure-request -- loopback control plane is intentionally exercised without TLS in this local fault test
  const liveDuringFault = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(2_000) });
  if (!liveDuringFault.ok) throw new Error("liveness failed during a database outage");

  await requiredFetch(`${toxiproxyApi}/proxies/${proxyName}/toxics/database-reset`, {
    method: "DELETE",
  });
  await waitFor(`${baseUrl}/ready`, (response) => response.ok, 10_000);
} catch (error) {
  throw new Error(
    `${error instanceof Error ? error.message : String(error)}\n${childOutput.slice(-4_000)}`,
  );
} finally {
  child.kill("SIGTERM");
  await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    new Promise((resolve) => setTimeout(resolve, 3_000)),
  ]);
  if (child.exitCode === null) child.kill("SIGKILL");
  await fetch(`${toxiproxyApi}/proxies/${proxyName}`, { method: "DELETE" }).catch(() => undefined);
}

async function waitFor(url, predicate, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      // nosemgrep: typescript.react.security.react-insecure-request.react-insecure-request -- loopback services are the subject of this local resilience test
      const response = await fetch(url, { signal: AbortSignal.timeout(2_000) });
      if (predicate(response)) return;
      lastError = new Error(`${url} returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(
    `Timed out waiting for ${url}: ${lastError instanceof Error ? lastError.message : "no response"}`,
  );
}

async function requiredFetch(url, init) {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(3_000) });
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  return response;
}
