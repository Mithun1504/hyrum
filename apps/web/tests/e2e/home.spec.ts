import { expect, test } from "@playwright/test";

test("renders the public product foundation", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /put the receipt in front of the merge/i }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();
});
