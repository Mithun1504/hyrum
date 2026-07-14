import type { RequestContext } from "@hyrum/contracts";
import type { DatabaseClient } from "@hyrum/db";

declare module "fastify" {
  interface FastifyInstance {
    database: DatabaseClient;
    authenticateHuman: (request: FastifyRequest) => Promise<void>;
  }

  interface FastifyRequest {
    authContext?: RequestContext;
  }
}
