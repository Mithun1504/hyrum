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
    await expect(page.getByRole("heading", { name: "Capture" })).toBeVisible();

    await page.getByRole("link", { name: /^Behavior$/i }).click();
    await expect(page.getByText(`sha256:${"6".repeat(64)}`)).toBeVisible();
    await expect(page.getByText(/T3 exposure/i)).toBeVisible();

    await page.getByRole("link", { name: /Change gate/i }).click();
    await expect(page.getByText("BLOCK", { exact: true }).first()).toBeVisible();
    await expect(page.getByText(/informational findings/i)).toBeVisible();

    await page.getByRole("link", { name: "Inspect receipt" }).click();
    await expect(page.getByText(`sha256:${"6".repeat(64)}`)).toBeVisible();

    await page.getByRole("link", { name: /Change gate/i }).click();
    await page.getByRole("link", { name: "Full replay report" }).click();
    await expect(page.getByRole("heading", { name: "Replay health & coverage" })).toBeVisible();

    await page.getByRole("link", { name: "Ledger" }).click();
    await page.getByLabel("Tier").selectOption("T3");
    await page.getByRole("button", { name: "Filter" }).click();
    await expect(page).toHaveURL(/tier=T3/);
    await expect(page.getByRole("heading", { name: "Accidental-contract ledger" })).toBeVisible();
    await expect(page.getByText("T3", { exact: true }).last()).toBeVisible();
  });

  test("selects T2 from the ledger and opens the matching receipt from the gate", async ({
    page,
  }) => {
    await page.goto("/app?view=ledger");
    await page.getByRole("link", { name: /Stable validation error ordering/i }).click();

    await expect(page).toHaveURL(/entry=90000000-0000-4000-8000-000000000002/);
    await expect(
      page.getByRole("heading", { name: /Stable validation error ordering/i }),
    ).toBeVisible();
    await expect(page.getByText(`sha256:${"7".repeat(64)}`)).toBeVisible();
    await expect(page.getByText(/11 observations/i)).toBeVisible();

    await page.getByRole("link", { name: /Change gate/i }).click();
    await page.getByRole("link", { name: "Open matched evidence" }).nth(1).click();

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

    await expect(page.getByRole("heading", { name: "Capture" })).toBeVisible();
    await expect(page.getByRole("main").getByText("Gateway", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Open navigation" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Close navigation" })).toHaveCount(0);
  });
});
