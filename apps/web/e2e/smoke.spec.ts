import { expect, test } from "@playwright/test";

// Placeholder smoke test — wires the Playwright harness against the empty
// shell page. Real critical-flow e2e specs (identity-bridge sign-in,
// connection accept -> inventory visible -> contact revealed, etc.) land
// alongside their feature slices in later PRs.
test("shell page renders", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Red Aliados" })).toBeVisible();
});
