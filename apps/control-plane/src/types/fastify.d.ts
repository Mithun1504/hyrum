import type {
  IdentityContext,
  IdentityOrganization,
  MachineScope,
  Permission,
  RequestContext,
  RunnerScope,
} from "@hyrum/contracts";
import type {
  DatabaseClient,
  MachineCredentialLookup,
  PlatformOperatorIdentity,
  RunnerCredentialLookup,
} from "@hyrum/db";
import type { RuntimeEnv } from "@hyrum/env";
import type { ObjectStorage } from "@hyrum/storage";
import type { WorkOS } from "@workos-inc/node";

declare module "fastify" {
  interface FastifyInstance {
    database: DatabaseClient;
    runtimeEnv: RuntimeEnv;
    objectStorage: ObjectStorage;
    machineTokenPepper: string | null;
    workos: WorkOS | null;
    authenticateIdentity: (request: FastifyRequest) => Promise<void>;
    authenticateHuman: (request: FastifyRequest) => Promise<void>;
    authenticateOperator: (
      capability: string,
      requireRecentAuth?: boolean,
    ) => (request: FastifyRequest) => Promise<void>;
    listIdentityOrganizations: (request: FastifyRequest) => Promise<IdentityOrganization[]>;
    requirePermission: (
      permission: Permission,
      options?: { recentAuth?: boolean },
    ) => (request: FastifyRequest) => Promise<void>;
    authenticateMachine: (
      requiredScope: MachineScope,
    ) => (request: FastifyRequest) => Promise<void>;
    authenticateRunner: (requiredScope: RunnerScope) => (request: FastifyRequest) => Promise<void>;
  }

  interface FastifyRequest {
    rawBody?: string;
    identityContext?: IdentityContext;
    authContext?: RequestContext;
    machineCredential?: MachineCredentialLookup;
    runnerCredential?: RunnerCredentialLookup;
    platformOperator?: PlatformOperatorIdentity;
  }
}
