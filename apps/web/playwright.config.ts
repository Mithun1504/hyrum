import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://127.0.0.1:3017",
    trace: "on-first-retry",
  },
  webServer: [
    {
      command: "node tests/fixtures/control-plane.mjs",
      url: "http://127.0.0.1:4317/health",
      reuseExistingServer: !process.env.CI,
    },
    {
      command:
        "HYRUM_E2E_AUTH_BYPASS=1 CONTROL_PLANE_URL=http://127.0.0.1:4317 NEXT_DIST_DIR=.next-e2e pnpm exec next dev --port 3017",
      url: "http://127.0.0.1:3017/api/health",
      reuseExistingServer: !process.env.CI,
    },
  ],
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
