import { defineConfig } from "tsup";

export default defineConfig({
  external: ["drizzle-orm", "pino", "postgres", "zod"],
  noExternal: [/^@hyrum\//],
});
