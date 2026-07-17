import { z } from "zod";

export const globalSearchQuerySchema = z.strictObject({
  q: z.string().trim().min(2).max(100),
  limit: z.coerce.number().int().min(1).max(20).default(8),
});

const searchResultBaseSchema = z.object({
  id: z.uuid(),
  serviceName: z.string(),
  serviceSlug: z.string(),
  title: z.string(),
  subtitle: z.string(),
  href: z.string().startsWith("/app/"),
});

export const globalSearchResponseSchema = z.object({
  query: z.string(),
  groups: z.object({
    endpoints: z.array(searchResultBaseSchema.extend({ method: z.string(), path: z.string() })),
    consumers: z.array(searchResultBaseSchema.extend({ requestCount: z.string().regex(/^\d+$/) })),
    ledger: z.array(
      searchResultBaseSchema.extend({
        tier: z.enum(["t1", "t2", "t3"]),
        freshnessStatus: z.enum(["fresh", "aging", "stale"]),
      }),
    ),
  }),
});

export type GlobalSearchResponse = z.infer<typeof globalSearchResponseSchema>;
