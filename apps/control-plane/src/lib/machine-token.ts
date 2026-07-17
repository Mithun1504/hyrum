import { randomBytes } from "node:crypto";
import { hash, verify } from "@node-rs/argon2";

const TOKEN_PATTERN = /^hyrum_agent_([0-9a-f]{16})_([A-Za-z0-9_-]{43})$/;
const RUNNER_TOKEN_PATTERN = /^hyrum_runner_([0-9a-f]{16})_([A-Za-z0-9_-]{43})$/;
const ARGON_OPTIONS = {
  memoryCost: 65_536,
  timeCost: 3,
  parallelism: 1,
  outputLen: 32,
} as const;

export function machineTokenPrefix(token: string): string | null {
  return TOKEN_PATTERN.exec(token)?.[1] ?? null;
}

export async function issueMachineToken(pepper: string): Promise<{
  token: string;
  tokenPrefix: string;
  tokenHash: string;
}> {
  const tokenPrefix = randomBytes(8).toString("hex");
  const secret = randomBytes(32).toString("base64url");
  const token = `hyrum_agent_${tokenPrefix}_${secret}`;
  const tokenHash = await hash(token, {
    ...ARGON_OPTIONS,
    secret: Buffer.from(pepper, "utf8"),
  });
  return { token, tokenPrefix, tokenHash };
}

export function runnerTokenPrefix(token: string): string | null {
  return RUNNER_TOKEN_PATTERN.exec(token)?.[1] ?? null;
}

export async function issueRunnerToken(pepper: string): Promise<{
  token: string;
  tokenPrefix: string;
  tokenHash: string;
}> {
  const tokenPrefix = randomBytes(8).toString("hex");
  const secret = randomBytes(32).toString("base64url");
  const token = `hyrum_runner_${tokenPrefix}_${secret}`;
  const tokenHash = await hash(token, {
    ...ARGON_OPTIONS,
    secret: Buffer.from(pepper, "utf8"),
  });
  return { token, tokenPrefix, tokenHash };
}

export async function verifyMachineToken(
  tokenHash: string,
  token: string,
  pepper: string,
): Promise<boolean> {
  try {
    return await verify(tokenHash, token, { secret: Buffer.from(pepper, "utf8") });
  } catch {
    return false;
  }
}
