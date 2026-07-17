import { defineConfig } from "tsup";

export default defineConfig({
  external: [
    "@aws-sdk/client-s3",
    "@aws-sdk/s3-request-presigner",
    "drizzle-orm",
    "pino",
    "postgres",
    "zod",
  ],
  noExternal: [/^@hyrum\//],
});
