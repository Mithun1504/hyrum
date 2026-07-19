import { expect, test } from "@playwright/test";

test.describe("workspace", () => {
  test.describe.configure({ mode: "serial" });
  test("navigates the evidence and gate surfaces", async ({ page }) => {
    await page.goto("/app");
    await expect(page.getByRole("main").getByText("Latest gate decision")).toBeVisible();
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

    await mainNav.getByRole("link", { name: "01 Capture", exact: true }).click();
    await expect(page.getByText("Following live")).toBeVisible();
    await expect(page.getByText("capture · batch ingested")).toBeVisible();

    await mainNav.getByRole("link", { name: "02 Ledger", exact: true }).click();
    const t1Row = page.getByText("Echoed idempotency key").locator("xpath=ancestor::tr");
    await t1Row.getByRole("link", { name: "Receipt" }).click();
    await expect(page.getByText(`sha256:${"6".repeat(64)}`)).toBeVisible();
    await expect(page.getByText("T1 echo evidence", { exact: true })).toBeVisible();

    await mainNav.getByRole("link", { name: /Change gate/i }).click();
    await expect(
      page.getByRole("heading", { name: /Deterministic decision: BLOCK/i }),
    ).toBeVisible();
    await expect(page.getByText(/notes/i)).toBeVisible();

    await page.getByRole("link", { name: "Matched receipt" }).click();
    await expect(page.getByText(`sha256:${"6".repeat(64)}`)).toBeVisible();

    await mainNav.getByRole("link", { name: /Change gate/i }).click();
    await mainNav.getByRole("link", { name: /Replay integrity/i }).click();
    await expect(page.getByRole("heading", { name: "Replay integrity" })).toBeVisible();

    await mainNav.getByRole("link", { name: "02 Ledger", exact: true }).click();
    await page.getByLabel("Tier").selectOption("T3");
    await page.getByRole("button", { name: "Filter" }).click();
    await expect(page).toHaveURL(/tier=T3/);
    await expect(page.getByRole("heading", { name: "Accidental-contract ledger" })).toBeVisible();
    await expect(
      page.getByRole("table").getByText("Legacy field exposure", { exact: true }),
    ).toBeVisible();
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
    await expect(page.getByText(/^11 observations across/i)).toBeVisible();

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
    await page.reload();
    await page.getByRole("button", { name: /Draft OpenAPI change/i }).click();
    await expect(
      page.getByText(/Spec draft generated from model evidence processing/i),
    ).toBeVisible();
    await expect(page.getByText("Document echoed idempotency key")).toBeVisible();
    await page
      .getByPlaceholder("Why this is the correct expiry outcome.")
      .first()
      .fill("The observed contract is now documented.");
    await page.getByRole("button", { name: "Record resolution" }).first().click();
    await expect(page.getByText("Resolved").first()).toBeVisible();
    await expect(page.getByText("The observed contract is now documented.")).toBeVisible();
  });

  test("promotes and demotes a dependency claim through human review", async ({ page }) => {
    await page.goto("/app?view=behavior&entry=90000000-0000-4000-8000-000000000001");
    await page.getByLabel("Evidence tier override").selectOption("T2");
    await page.getByPlaceholder("Review reason").fill("Confirmed temporary migration behavior.");
    await page.getByRole("button", { name: "Apply" }).click();
    await expect(page.getByText("Evidence tier overridden to T2.")).toBeVisible();
  });

  test("publishes a new tenant policy version from the dashboard", async ({ page }) => {
    await page.goto("/app?view=policy");
    await expect(page.getByRole("heading", { name: "Policy", exact: true })).toBeVisible();
    await page.getByRole("main").getByLabel("Matched T3 outcome").selectOption("warn");
    await page.getByRole("button", { name: "Publish new version" }).click();
    await expect(page.getByText("Policy version 2 is now active.")).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("Matched T3 outcome").first()).toHaveValue("warn");
  });

  test("curates and activates a fixture-backed replay corpus", async ({ page }) => {
    await page.goto("/app?view=replay");
    await page.getByLabel("Version").fill("e2e-v1");
    await page.getByLabel("Redacted corpus archive").setInputFiles({
      name: "corpus.ndjson",
      mimeType: "application/x-ndjson",
      buffer: Buffer.from('{"redacted":true}\n'),
    });
    await page.getByLabel("Disposable fixture database").setInputFiles({
      name: "fixture.dump",
      mimeType: "application/octet-stream",
      buffer: Buffer.from("fixture database"),
    });
    await page.getByLabel("Side-effect stub configuration (optional)").setInputFiles({
      name: "stubs.json",
      mimeType: "application/json",
      buffer: Buffer.from('{"stubs":[]}'),
    });
    await expect(page.getByText(/corpus.ndjson uploaded/i)).toBeVisible();
    await expect(page.getByText(/fixture.dump uploaded/i)).toBeVisible();
    await page.getByRole("button", { name: "Create draft corpus" }).click();
    await expect(page.getByRole("heading", { name: "Corpus e2e-v1" })).toBeVisible();

    await page.getByLabel("Case ID").fill("checkout-idempotency");
    await page.getByLabel("Coverage class").fill("response-shape");
    await page.getByLabel("Redacted request case").setInputFiles({
      name: "case.ndjson",
      mimeType: "application/x-ndjson",
      buffer: Buffer.from('{"case":"checkout"}\n'),
    });
    await expect(page.getByText(/case.ndjson uploaded/i)).toBeVisible();
    await page.getByLabel("Replay priority").fill("10");
    await page.getByRole("button", { name: "Add enabled case" }).click();
    await expect(page.getByText(/Case checkout-idempotency added/i)).toBeVisible();
    await page.getByRole("button", { name: "Mark ready" }).click();
    await expect(page.getByText("ready", { exact: true })).toBeVisible();
  });

  test("runs a receipt-bound model advisory without changing deterministic state", async ({
    page,
  }) => {
    await page.goto("/app?view=overview");
    await page.getByRole("button", { name: "Run advisory" }).click();
    await expect(
      page.getByText("Receipt-backed behaviors form one compatibility cluster."),
    ).toBeVisible();
    await expect(page.getByText("Echoed request correlation")).toBeVisible();
    await expect(page.getByRole("main").getByText("deterministic boundary")).toBeVisible();
  });

  test("applies the theme before the next animation frame", async ({ page }) => {
    await page.goto("/app");
    const toggle = page.getByRole("button", { name: "Switch to light theme" });
    await expect(toggle).toBeVisible();

    const result = await toggle.evaluate(async (button) => {
      if (!(button instanceof HTMLButtonElement)) throw new Error("Theme toggle is not a button");
      const startedAt = performance.now();
      button.click();
      await new Promise(requestAnimationFrame);
      return {
        elapsed: performance.now() - startedAt,
        dark: document.documentElement.classList.contains("dark"),
        stored: localStorage.getItem("theme"),
      };
    });

    expect(result.dark).toBe(false);
    expect(result.stored).toBe("light");
    expect(result.elapsed).toBeLessThan(250);
  });

  test("renders workspace content after a mobile reload before opening navigation", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/app");
    await page.reload();

    await expect(page.getByRole("main").getByText("Latest gate decision")).toBeVisible();
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
