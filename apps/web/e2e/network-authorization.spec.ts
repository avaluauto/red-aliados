import { expect, test } from "@playwright/test";

// Task 3.3. These specs run against the `build:e2e` build (see
// playwright.config.ts), reusing identity-bridge's session seam
// (window.__RED_ALIADOS_E2E_SESSION__, see
// src/features/identity-bridge/data/session.ts) plus a dedicated harness
// route (src/routes/e2e-network-guard.tsx) that exercises the real
// useVisibilityTier + useGuardedQuery hooks in a real browser.

const ENABLED_TENANT_SESSION = {
  status: "authenticated" as const,
  rawClaims: {
    tenant_id: "11111111-1111-4111-8111-111111111111",
    role: "dealer_admin",
    red_aliados_enabled: true,
  },
};

const TARGET_TENANT_ID = "33333333-3333-4333-8333-333333333333";

function seedSessionScript(seeded: unknown) {
  (window as unknown as { __RED_ALIADOS_E2E_SESSION__?: unknown }).__RED_ALIADOS_E2E_SESSION__ =
    seeded;
}

function harnessUrl(params: Record<string, string>) {
  return `/e2e-network-guard?${new URLSearchParams(params).toString()}`;
}

test.describe("network-authorization", () => {
  // ---------------------------------------------------------------------
  // 3.3(a): the client-side guard, exercised in a real browser render, is
  // proven to suppress both the query attempt and the resulting UI for an
  // unconnected tenant. This is a UX/integration proof of the CLIENT guard
  // -- see the skipped test below for why it is NOT proof of the actual
  // security boundary.
  // ---------------------------------------------------------------------
  test("an unconnected tenant's UI issues zero cross-tenant queries and renders no cross-tenant data", async ({
    page,
  }) => {
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
    await expect(page.getByTestId("no-data")).toBeVisible();
    await expect(page.getByTestId("cross-tenant-data")).toHaveCount(0);

    const queryCalls = await page.evaluate(
      () =>
        (window as unknown as { __RED_ALIADOS_E2E_GUARD_QUERY_CALLS__?: number })
          .__RED_ALIADOS_E2E_GUARD_QUERY_CALLS__ ?? 0,
    );
    expect(queryCalls).toBe(0);
  });

  // Contrast case: proves the guard is not simply always-off -- a connected
  // tenant's tier allows the query, and it does fire exactly once.
  test("a connected tenant's UI does attempt the guarded query", async ({ page }) => {
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
    await expect(page.getByTestId("cross-tenant-data")).toBeVisible();

    const queryCalls = await page.evaluate(
      () =>
        (window as unknown as { __RED_ALIADOS_E2E_GUARD_QUERY_CALLS__?: number })
          .__RED_ALIADOS_E2E_GUARD_QUERY_CALLS__ ?? 0,
    );
    expect(queryCalls).toBe(1);
  });

  // ---------------------------------------------------------------------
  // 3.3(b) -- the assertion that actually matters, per spec.md's
  // "Direct API/table access still denied" scenario: even when the client
  // guard is bypassed entirely (a malicious client querying Supabase
  // directly), RLS itself must return zero rows.
  //
  // VERIFICATION GAP, stated explicitly rather than faked: there is no live
  // red-aliados Supabase project yet (see supabase/THIRD_PARTY_AUTH.md,
  // "Status: NOT CONFIGURED"). Any Playwright assertion against a
  // `page.route` mock of `**/rest/v1/**` would only prove that our own
  // mocked response matches our own expectation -- it would NOT exercise
  // real PostgREST + RLS, and reporting it as green here would misrepresent
  // it as proof of server-side enforcement. That would be exactly the
  // mistake this task warns against (testing the guard's own logic instead
  // of the real enforcement point).
  //
  // What IS actually verified today: PR1's apply-progress records that the
  // full `app.visibility_tier()` matrix and deny-by-default RLS were
  // hand-verified via raw SQL against a disposable local Postgres 17
  // database -- not through this app's real client, and not via pgTAP
  // (extension unavailable in-sandbox; see supabase/tests/database/*.test.sql,
  // "unexecuted-by-pgTAP").
  //
  // First action once a live Supabase project + this app's real client
  // exist: un-skip this test, replace the body below with a real
  // `supabaseClient.from(...).select()` call issued directly from
  // `page.evaluate` (bypassing useGuardedQuery/useVisibilityTier entirely)
  // against an unconnected-tenant JWT, and assert the real REST response is
  // an empty array.
  // ---------------------------------------------------------------------
  test.skip("direct Supabase query bypassing the client guard is still denied by RLS (zero rows)", async () => {
    // Intentionally left unimplemented -- see the VERIFICATION GAP note
    // above. Do not replace this with a mocked page.route response; that
    // would assert the mock, not RLS.
  });
});
