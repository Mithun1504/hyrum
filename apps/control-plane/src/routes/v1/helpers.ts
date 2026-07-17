import type { RequestContext } from "@hyrum/contracts";
import type { FastifyInstance, FastifyRequest } from "fastify";

export async function requireHuman(app: FastifyInstance, request: FastifyRequest) {
  await app.authenticateHuman(request);
  if (!request.authContext) throw app.httpErrors.unauthorized();
  return request.authContext;
}

export function requireContext(app: FastifyInstance, context: RequestContext | undefined) {
  if (!context) throw app.httpErrors.unauthorized();
  return context;
}

export function asIso(value: Date | string) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

export function nullableIso(value: Date | string | null) {
  return value === null ? null : asIso(value);
}
