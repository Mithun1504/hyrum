import { expect, test } from "@playwright/test";

const workosConfigured =
  Boolean(process.env.WORKOS_CLIENT_ID) &&
  Boolean(process.env.WORKOS_API_KEY) &&
  Boolean(process.env.WORKOS_COOKIE_PASSWORD) &&
  Boolean(process.env.NEXT_PUBLIC_WORKOS_REDIRECT_URI);

test.describe("workspace", () => {
  test.skip(
    !workosConfigured,
    "WorkOS test auth is not configured for authenticated workspace E2E.",
  );

  test("navigates the evidence and gate surfaces", async ({ page }) => {
    await page.goto("/app");
    await expect(page.getByText("Latest gate decision")).toBeVisible();
    await expect(page.getByRole("heading", { name: "This candidate is blocked." })).toBeVisible();

    const mainNav = page.getByRole("navigation", { name: "Main navigation" });
    await expect(mainNav.getByRole("link")).toHaveText([
      /Overview/,
      /Capture/,
      /Ledger/,
      /Change gate/,
      /Assertions/,
      /Consumers/,
      /Endpoints/,
      /Replay integrity/,
      /Policy/,
    ]);

    await page.getByRole("link", { name: /Ledger/i }).click();
    const t1Row = page.getByText("Echoed idempotency key").locator("xpath=ancestor::tr");
    await t1Row.getByRole("link", { name: "Receipt" }).click();
    await expect(page.getByText(`sha256:${"6".repeat(64)}`)).toBeVisible();
    await expect(page.getByText(/T1 echo evidence/i)).toBeVisible();

    await page.getByRole("link", { name: /Change gate/i }).click();
    await expect(
      page.getByRole("heading", { name: /Deterministic decision: BLOCK/i }),
    ).toBeVisible();
    await expect(page.getByText(/notes/i)).toBeVisible();

    await page.getByRole("link", { name: "Matched receipt" }).click();
    await expect(page.getByText(`sha256:${"6".repeat(64)}`)).toBeVisible();

    await page.getByRole("link", { name: /Change gate/i }).click();
    await page.getByRole("link", { name: "Replay integrity" }).click();
    await expect(page.getByRole("heading", { name: "Replay integrity" })).toBeVisible();

    await page.getByRole("link", { name: "Ledger" }).click();
    await page.getByLabel("Tier").selectOption("T3");
    await page.getByRole("button", { name: "Filter" }).click();
    await expect(page).toHaveURL(/tier=T3/);
    await expect(page.getByRole("heading", { name: "Accidental-contract ledger" })).toBeVisible();
    await expect(page.getByText("Legacy field exposure", { exact: true })).toBeVisible();
  });

  test("selects T2 from the ledger and opens the matching receipt from the gate", async ({
    page,
  }) => {
    await page.goto("/app?view=ledger");
    const t2Row = page.getByText("Validation error template branch").locator("xpath=ancestor::tr");
    await t2Row.getByRole("link", { name: "Receipt" }).click();

    await expect(page).toHaveURL(/entry=90000000-0000-4000-8000-000000000002/);
    await expect(
      page.getByRole("heading", { name: /Validation error template branch/i }),
    ).toBeVisible();
    await expect(page.getByText(`sha256:${"7".repeat(64)}`)).toBeVisible();
    await expect(page.getByText(/11 observations/i)).toBeVisible();

    await page.getByRole("link", { name: /Change gate/i }).click();
    const t2Delta = page
      .getByText("$.response.error.template · error delta")
      .locator("xpath=ancestor::article");
    await t2Delta.getByRole("link", { name: "Open evidence" }).click();

    await expect(page).toHaveURL(/entry=90000000-0000-4000-8000-000000000002/);
    await expect(page.getByText(`sha256:${"7".repeat(64)}`)).toBeVisible();
  });

  test("validates the assertion and OpenAPI draft lifecycle", async ({ page }) => {
    await page.goto("/app?view=assertions");
    await expect(page.getByRole("heading", { name: "Assertions", exact: true })).toBeVisible();

    const pinButton = page.getByRole("button", { name: "Pin assertion" });
    await expect(pinButton).toBeDisabled();
    await page.getByLabel("Reason").fill("Protect the support importer migration window.");
    await expect(pinButton).toBeEnabled();
    await pinButton.click();
    await expect(page.getByText(/pinned and added to replay enforcement/i)).toBeVisible();
  });

  test("renders workspace content after a mobile reload before opening navigation", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/app");
    await page.reload();

    await expect(page.getByText("Latest gate decision")).toBeVisible();
    await expect(page.getByRole("link", { name: /Open change gate/i })).toBeVisible();
    await expect(page.getByRole("button", { name: "Open navigation" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Close navigation" })).toHaveCount(0);
    await expect(
      page.getByRole("navigation", { name: "Mobile navigation" }).getByRole("link"),
    ).toHaveText([/Overview/, /Ledger/, /Gate/, /Assertions/]);

    await page.getByRole("button", { name: "Open full navigation" }).click();

    const drawerNav = page.getByRole("navigation", { name: "Main navigation" });
    await expect(drawerNav.getByRole("link", { name: /Capture/i })).toBeVisible();
    await expect(drawerNav.getByRole("link", { name: /Policy/i })).toBeVisible();
  });
});
