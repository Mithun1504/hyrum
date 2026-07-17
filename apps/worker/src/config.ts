import type { RuntimeEnv } from "@hyrum/env";

type WorkerDatabaseEnv = Pick<RuntimeEnv, "DATABASE_URL" | "NODE_ENV" | "WORKER_DATABASE_URL">;

export function workerDatabaseUrl(env: WorkerDatabaseEnv): string {
  if (env.NODE_ENV !== "production") return env.WORKER_DATABASE_URL ?? env.DATABASE_URL;
  if (!env.WORKER_DATABASE_URL) {
    throw new Error("WORKER_DATABASE_URL is required in production");
  }
  const appPrincipal = new URL(env.DATABASE_URL).username;
  const workerPrincipal = new URL(env.WORKER_DATABASE_URL).username;
  if (!appPrincipal || !workerPrincipal || workerPrincipal === appPrincipal) {
    throw new Error("WORKER_DATABASE_URL must use a database principal distinct from DATABASE_URL");
  }
  return env.WORKER_DATABASE_URL;
}
