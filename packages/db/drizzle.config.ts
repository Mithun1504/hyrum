import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: ["./src/schema.ts", "./src/product-schema.ts", "./src/ai-schema.ts"],
  out: "./migrations",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgresql://hyrum:hyrum@localhost:5432/hyrum",
  },
  strict: true,
  verbose: true,
});
