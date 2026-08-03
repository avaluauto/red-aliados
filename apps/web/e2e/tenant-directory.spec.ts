import { expect, test } from "@playwright/test";

// Task 5.4. These specs run against the `build:e2e` build (see
// playwright.config.ts), reusing identity-bridge's session seam
// (window.__RED_ALIADOS_E2E_SESSION__) plus a dedicated harness route
// (src/routes/e2e-tenant-directory.tsx) that exercises the real
// useVisibilityTier hook + CandidateCard component in a real browser.

const ENABLED_TENANT_SESSION = {
  status: "authenticated" as const,
  rawClaims: {
    tenant_id: "11111111-1111-4111-8111-111111111111",
    app_role: "dealer_admin",
    red_aliados_enabled: true,
  },
};

const TARGET_TENANT_ID = "33333333-3333-4333-8333-333333333333";

function seedSessionScript(seeded: unknown) {
  (window as unknown as { __RED_ALIADOS_E2E_SESSION__?: unknown }).__RED_ALIADOS_E2E_SESSION__ =
    seeded;
}

function harnessUrl(params: Record<string, string>) {
  return `/e2e-tenant-directory?${new URLSearchParams(params).toString()}`;
}

test.describe("tenant-directory", () => {
  // ---------------------------------------------------------------------
  // spec: Reputation Visible Pre-Connection + Contact Reveal Gated by
  // Acceptance -- a candidate-tier target (linked by a suggested/pending
  // connection_requests row) shows reputation, but the phone/WhatsApp stays
  // masked.
  // ---------------------------------------------------------------------
  test("a candidate-tier target shows reputation with the phone masked", async ({ page }) => {
    await page.addInitScript(seedSessionScript, ENABLED_TENANT_SESSION);

    await page.goto(
      harnessUrl({
        targetTenantId: TARGET_TENANT_ID,
        hasNetworkAccess: "true",
        isConnected: "false",
        hasCandidateLink: "true",
      }),
    );

    await expect(page.getByTestId("tier")).toHaveText("candidate");
    await expect(page.getByTestId("candidate-card")).toBeVisible();
    await expect(page.getByTestId("candidate-reputation")).toBeVisible();
    await expect(page.getByTestId("candidate-contact-masked")).toBeVisible();
    await expect(page.getByTestId("candidate-contact")).toHaveCount(0);
  });

  // Contrast case: a connected-tier target (accepted mutual connection)
  // reveals both reputation and the real phone number.
  test("a connected-tier target reveals both reputation and the real phone", async ({ page }) => {
    await page.addInitScript(seedSessionScript, ENABLED_TENANT_SESSION);

    await page.goto(
      harnessUrl({
        targetTenantId: TARGET_TENANT_ID,
        hasNetworkAccess: "true",
        isConnected: "true",
        hasCandidateLink: "false",
      }),
    );

    await expect(page.getByTestId("tier")).toHaveText("connected");
    await expect(page.getByTestId("candidate-reputation")).toBeVisible();
    await expect(page.getByTestId("candidate-contact")).toHaveText("+52 55 1234 5678");
    await expect(page.getByTestId("candidate-contact-masked")).toHaveCount(0);
  });

  // ---------------------------------------------------------------------
  // spec: "a tenant with neither a suggested/pending connection request nor
  // an active connection to another tenant MUST see zero rows for that
  // tenant" -- there is no open directory browsing of the entire network.
  // ---------------------------------------------------------------------
  test("a tenant with no linking request at all sees zero candidate rows", async ({ page }) => {
    await page.addInitScript(seedSessionScript, ENABLED_TENANT_SESSION);

    await page.goto(
      harnessUrl({
        targetTenantId: TARGET_TENANT_ID,
        hasNetworkAccess: "true",
        isConnected: "false",
        hasCandidateLink: "false",
      }),
    );

    await expect(page.getByTestId("tier")).toHaveText("none");
    await expect(page.getByTestId("no-candidates")).toBeVisible();
    await expect(page.getByTestId("candidate-card")).toHaveCount(0);
  });
});
