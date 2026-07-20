import { expect, test } from "@playwright/test";

test("renders the public product foundation", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", {
      name: /catch api breaks before release/i,
    }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: /a gate that blocks only on proof/i }),
  ).toBeVisible();
});
