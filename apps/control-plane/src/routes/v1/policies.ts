import { gatePolicySchema, upsertGatePolicyRequestSchema } from "@hyrum/contracts";
import { and, auditEvents, desc, eq, gatePolicies, withTenant } from "@hyrum/db";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { requireContext } from "./helpers";

function serializePolicy(policy: typeof gatePolicies.$inferSelect) {
  return gatePolicySchema.parse({
    id: policy.id,
    version: policy.version,
    block_tiers: policy.blockTiers,
    warn_tiers: policy.warnTiers,
    active: policy.active,
  });
}

export const policyRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    "/policy",
    {
      preHandler: app.requireHumanPermission("ledger:read"),
      schema: {
        tags: ["policy"],
        security: [{ bearerAuth: [] }],
        response: { 200: gatePolicySchema },
      },
    },
    async (request) => {
      const context = requireContext(app, request.authContext);
      const [policy] = await withTenant(app.database.db, context.organizationId, (tx) =>
        tx
          .select()
          .from(gatePolicies)
          .where(
            and(
              eq(gatePolicies.organizationId, context.organizationId),
              eq(gatePolicies.active, true),
            ),
          )
          .orderBy(desc(gatePolicies.version))
          .limit(1),
      );
      if (!policy) throw app.httpErrors.notFound("Policy not configured");
      return serializePolicy(policy);
    },
  );

  app.put(
    "/policy",
    {
      preHandler: app.requireHumanPermission("policy:manage"),
      schema: {
        tags: ["policy"],
        security: [{ bearerAuth: [] }],
        body: upsertGatePolicyRequestSchema,
        response: { 200: gatePolicySchema },
      },
    },
    async (request) => {
      const context = requireContext(app, request.authContext);
      const [policy] = await withTenant(app.database.db, context.organizationId, async (tx) => {
        const [current] = await tx
          .select({ version: gatePolicies.version })
          .from(gatePolicies)
          .where(
            and(
              eq(gatePolicies.organizationId, context.organizationId),
              eq(gatePolicies.active, true),
            ),
          )
          .orderBy(desc(gatePolicies.version))
          .limit(1);
        if (current) {
          await tx
            .update(gatePolicies)
            .set({ active: false })
            .where(
              and(
                eq(gatePolicies.organizationId, context.organizationId),
                eq(gatePolicies.version, current.version),
              ),
            );
        }
        const [next] = await tx
          .insert(gatePolicies)
          .values({
            organizationId: context.organizationId,
            version: (current?.version ?? 0) + 1,
            blockTiers: request.body.block_tiers,
            warnTiers: request.body.warn_tiers,
          })
          .returning();
        await tx.insert(auditEvents).values({
          organizationId: context.organizationId,
          actorId: context.actorId,
          action: "policy.update",
          resourceType: "gate_policy",
          resourceId: next?.id,
          metadata: request.body,
        });
        return [next];
      });
      if (!policy) throw new Error("Failed to update policy");
      return serializePolicy(policy);
    },
  );
};
