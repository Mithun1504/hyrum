import {
  ledgerListSchema,
  ledgerQuerySchema,
  ledgerReviewPathParamsSchema,
  ledgerReviewRequestSchema,
  ledgerReviewResponseSchema,
  receiptAccessSchema,
  receiptPathParamsSchema,
  servicePathParamsSchema,
} from "@hyrum/contracts";
import {
  authorizeReceiptRead,
  getApiService,
  LedgerReviewError,
  listLedger,
  reviewLedgerClaim,
} from "@hyrum/db";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { decodeLedgerCursor, encodeLedgerCursor } from "../../lib/cursor";

export const ledgerRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    "/services/:identifier/ledger",
    {
      preHandler: app.requirePermission("ledger:read"),
      schema: {
        tags: ["ledger"],
        security: [{ bearerAuth: [] }],
        params: servicePathParamsSchema,
        querystring: ledgerQuerySchema,
        response: { 200: ledgerListSchema },
      },
    },
    async (request) => {
      const context = request.authContext;
      if (!context) throw app.httpErrors.unauthorized();
      const service = await getApiService(
        app.database.db,
        context.organizationId,
        request.params.identifier,
      );
      if (!service) throw app.httpErrors.notFound("Service not found");
      let cursor: ReturnType<typeof decodeLedgerCursor>;
      try {
        cursor = decodeLedgerCursor(request.query.cursor);
      } catch {
        throw app.httpErrors.badRequest("Ledger cursor is invalid");
      }
      const page = await listLedger(app.database.db, context.organizationId, service.id, {
        ...(request.query.tier ? { tier: request.query.tier } : {}),
        ...(request.query.search ? { search: request.query.search } : {}),
        ...(cursor ? { cursor } : {}),
        limit: request.query.limit,
      });
      return {
        data: page.records.map((entry) => ({
          ...entry,
          firstDetectedAt: entry.firstDetectedAt.toISOString(),
          lastObservedAt: entry.lastObservedAt.toISOString(),
          updatedAt: entry.updatedAt.toISOString(),
          receipt: entry.receipt
            ? { ...entry.receipt, expiresAt: entry.receipt.expiresAt.toISOString() }
            : null,
        })),
        page: {
          hasMore: page.nextCursor !== null,
          nextCursor: page.nextCursor ? encodeLedgerCursor(page.nextCursor) : null,
        },
      };
    },
  );

  app.post(
    "/receipts/:receiptId/access",
    {
      preHandler: app.requirePermission("ledger:read"),
      schema: {
        tags: ["ledger"],
        security: [{ bearerAuth: [] }],
        params: receiptPathParamsSchema,
        response: { 200: receiptAccessSchema },
      },
    },
    async (request) => {
      const context = request.authContext;
      if (!context) throw app.httpErrors.unauthorized();
      const authorized = await authorizeReceiptRead(
        app.database.db,
        context.organizationId,
        request.params.receiptId,
        {
          actorId: context.actor.actorId,
          requestId: request.id,
          actorType:
            context.actor.principalType === "platform_operator" ? "platform_operator" : "user",
          ...(context.actor.supportAccessGrantId
            ? { supportAccessGrantId: context.actor.supportAccessGrantId }
            : {}),
        },
      );
      if (!authorized) throw app.httpErrors.gone("Receipt is missing or expired");
      if (authorized.bucket !== app.objectStorage.bucket) {
        throw app.httpErrors.serviceUnavailable("Receipt storage is not configured");
      }
      const expiresIn = 60;
      const url = await app.objectStorage.signedReadUrl(
        context.organizationId,
        authorized.objectKey,
        expiresIn,
      );
      return { url, expiresAt: new Date(Date.now() + expiresIn * 1_000).toISOString() };
    },
  );

  app.post(
    "/ledger/:ledgerEntryId/review",
    {
      preHandler: app.requirePermission("claim:review", { recentAuth: true }),
      schema: {
        tags: ["ledger"],
        security: [{ bearerAuth: [] }],
        params: ledgerReviewPathParamsSchema,
        body: ledgerReviewRequestSchema,
        response: { 200: ledgerReviewResponseSchema },
      },
    },
    async (request) => {
      const context = request.authContext;
      if (!context?.actor.membershipId) throw app.httpErrors.unauthorized();
      try {
        const result = await reviewLedgerClaim(
          app.database.db,
          context.organizationId,
          request.params.ledgerEntryId,
          {
            membershipId: context.actor.membershipId,
            userId: context.actor.actorId,
            requestId: request.id,
          },
          {
            decision: request.body.decision,
            reason: request.body.reason,
            expectedUpdatedAt: new Date(request.body.expectedUpdatedAt),
            ...(request.body.toTier ? { toTier: request.body.toTier } : {}),
          },
        );
        return { ...result, updatedAt: result.updatedAt.toISOString() };
      } catch (error) {
        if (error instanceof LedgerReviewError && error.code === "not_found") {
          throw app.httpErrors.notFound(error.message);
        }
        if (error instanceof LedgerReviewError && error.code === "conflict") {
          throw app.httpErrors.conflict(error.message);
        }
        if (error instanceof LedgerReviewError) {
          throw app.httpErrors.unprocessableEntity(error.message);
        }
        throw error;
      }
    },
  );
};
