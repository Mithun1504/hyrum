import type { MachineScope, RequestContext, RunnerScope } from "@hyrum/contracts";
import {
  resolveMachineCredential,
  resolveRunnerCredential,
  touchMachineCredential,
} from "@hyrum/db";
import fp from "fastify-plugin";
import { machineTokenPrefix, runnerTokenPrefix, verifyMachineToken } from "../lib/machine-token";

export const machineAuthPlugin = fp<{ tokenPepper: string | undefined }>(async (app, options) => {
  app.decorate("machineTokenPepper", options.tokenPepper ?? null);
  app.decorate("authenticateMachine", (requiredScope: MachineScope) => {
    return async (request) => {
      if (!options.tokenPepper) {
        throw app.httpErrors.serviceUnavailable("Machine authentication is not configured");
      }
      const authorization = request.headers.authorization;
      if (!authorization?.startsWith("Bearer ")) throw app.httpErrors.unauthorized();
      const token = authorization.slice("Bearer ".length);
      const prefix = machineTokenPrefix(token);
      if (!prefix) throw app.httpErrors.unauthorized("The machine credential is invalid");
      const credential = await resolveMachineCredential(app.database, prefix);
      if (
        !credential ||
        !(await verifyMachineToken(credential.tokenHash, token, options.tokenPepper))
      ) {
        throw app.httpErrors.unauthorized("The machine credential is invalid or expired");
      }
      if (!credential.scopes.includes(requiredScope)) {
        throw app.httpErrors.forbidden("The machine credential does not grant this scope");
      }
      const context: RequestContext = {
        requestId: request.id,
        organizationId: credential.organizationId,
        actor: {
          actorId: credential.agentId,
          principalType: "capture_agent",
          permissions: requiredScope === "ingestion:write" ? ["ingestion:write"] : [],
          recentlyAuthenticated: false,
        },
      };
      request.machineCredential = credential;
      request.authContext = context;
      await touchMachineCredential(app.database, credential.credentialId);
    };
  });
  app.decorate("authenticateRunner", (requiredScope: RunnerScope) => {
    return async (request) => {
      if (!options.tokenPepper) {
        throw app.httpErrors.serviceUnavailable("Runner authentication is not configured");
      }
      const authorization = request.headers.authorization;
      if (!authorization?.startsWith("Bearer ")) throw app.httpErrors.unauthorized();
      const token = authorization.slice("Bearer ".length);
      const prefix = runnerTokenPrefix(token);
      if (!prefix) throw app.httpErrors.unauthorized("The runner credential is invalid");
      const credential = await resolveRunnerCredential(app.database, prefix);
      if (
        !credential ||
        !(await verifyMachineToken(credential.tokenHash, token, options.tokenPepper))
      ) {
        throw app.httpErrors.unauthorized("The runner credential is invalid or expired");
      }
      if (!credential.scopes.includes(requiredScope)) {
        throw app.httpErrors.forbidden("The runner credential does not grant this scope");
      }
      request.runnerCredential = credential;
      request.authContext = {
        requestId: request.id,
        organizationId: credential.organizationId,
        actor: {
          actorId: credential.sessionId,
          principalType: "ci_runner",
          permissions: requiredScope === "report:write" ? ["replay:report"] : ["corpus:read"],
          recentlyAuthenticated: false,
        },
      };
    };
  });
});
