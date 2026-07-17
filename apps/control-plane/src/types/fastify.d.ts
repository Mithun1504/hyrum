import type { Permission, RequestContext } from "@hyrum/contracts";
import type { DatabaseClient } from "@hyrum/db";
import type { S3ObjectStorage } from "@hyrum/storage";

declare module "fastify" {
  interface FastifyInstance {
    webUrl: string;
    database: DatabaseClient;
    objectStorage: S3ObjectStorage;
    authenticateHuman: (request: FastifyRequest) => Promise<void>;
    requireHumanPermission: (permission: Permission) => (request: FastifyRequest) => Promise<void>;
    authenticateMachine: (request: FastifyRequest) => Promise<void>;
    requireMachineScope: (scope: string) => (request: FastifyRequest) => Promise<void>;
  }

  interface FastifyRequest {
    authContext?: RequestContext;
  }
}
