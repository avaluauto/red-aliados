import { expect, test } from "@playwright/test";

// These specs run against the `build:e2e` build (see playwright.config.ts),
// which is the only build mode where the identity-bridge data adapter reads
// `window.__RED_ALIADOS_E2E_SESSION__` instead of calling a real Supabase
// project -- there is no live project to sign in against yet (task 2.1, see
// supabase/THIRD_PARTY_AUTH.md). This mirrors what
// `supabase.auth.getClaims()` would resolve for a verified V2-issued JWT.

const ENABLED_TENANT_SESSION = {
  status: "authenticated" as const,
  rawClaims: {
    tenant_id: "11111111-1111-4111-8111-111111111111",
    role: "dealer_admin",
    red_aliados_enabled: true,
  },
};

const DISABLED_TENANT_SESSION = {
  status: "authenticated" as const,
  rawClaims: {
    tenant_id: "22222222-2222-4222-8222-222222222222",
    role: "dealer_admin",
    red_aliados_enabled: false,
  },
};

function seedSessionScript(seeded: unknown) {
  (window as unknown as { __RED_ALIADOS_E2E_SESSION__?: unknown }).__RED_ALIADOS_E2E_SESSION__ =
    seeded;
}

test.describe("identity-bridge", () => {
  test("a valid JWT for an enabled tenant signs in silently, no gate shown", async ({ page }) => {
    await page.addInitScript(seedSessionScript, ENABLED_TENANT_SESSION);

    await page.goto("/");

    await expect(page.getByRole("heading", { name: "Red Aliados", exact: true })).toBeVisible();
    await expect(page.getByText(/isn't enabled/i)).toHaveCount(0);
    await expect(page.getByText(/no active red aliados session/i)).toHaveCount(0);
  });

  test("a JWT for a disabled tenant sees the gate screen and fires zero data queries", async ({
    page,
  }) => {
    let restQueryCount = 0;
    await page.route("**/rest/v1/**", (route) => {
      restQueryCount += 1;
      route.abort();
    });

    await page.addInitScript(seedSessionScript, DISABLED_TENANT_SESSION);

    await page.goto("/");

    await expect(page.getByRole("status")).toHaveText(/isn't enabled/i);
    await expect(page.getByRole("heading", { name: "Red Aliados", exact: true })).toHaveCount(0);
    expect(restQueryCount).toBe(0);
  });
});
