import { expect, test } from "@playwright/test";

// Placeholder smoke test — wires the Playwright harness against the empty
// shell page. Real critical-flow e2e specs (identity-bridge sign-in,
// connection accept -> inventory visible -> contact revealed, etc.) land
// alongside their feature slices in later PRs.
//
// PR2 note: the root layout is now gated by identity-bridge's IdentityGate
// (see src/routes/__root.tsx), and without a seeded session this test never
// reaches the home route's own "Red Aliados" heading — it lands on the
// no-session gate state instead, whose copy also happens to contain the
// substring "Red Aliados". Asserting on the page title instead keeps this
// test's original narrow scope (the harness boots the app for real) without
// depending on identity-bridge's gate state, which apps/web/e2e/identity-bridge.spec.ts
// now owns.
test("shell page renders", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveTitle("Red Aliados");
});
