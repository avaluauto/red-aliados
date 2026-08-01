import { expect, type Route, test } from "@playwright/test";

// Task 7.3. Same test-seam pattern as identity-bridge/network-authorization/
// tenant-directory/network-connections: runs against the `build:e2e` build,
// seeds window.__RED_ALIADOS_E2E_SESSION__, and drives a dedicated harness
// route (src/routes/e2e-partner-reputation.tsx) that wires the REAL
// useReputationScore hook + ReputationBadge component -- exercising the
// actual query call shape against `supabaseClient`.
//
// There is no live red-aliados Supabase project yet (see
// supabase/THIRD_PARTY_AUTH.md, "Status: NOT CONFIGURED"), so this
// intercepts the underlying PostgREST call via `page.route` rather than
// hitting a real Postgres instance. This proves the CLIENT wiring end-to-end
// (hook -> computeReputationScore -> render), not that the DB trigger
// (app.emit_reputation_event, supabase/migrations/0008_reputation_events_trigger.sql)
// itself produced these rows -- the mocked response stands in for what that
// trigger would have written. THE TRIGGER ITSELF is proven separately, for
// real, against a disposable local Postgres database (see this PR's
// apply-progress and
// supabase/tests/database/0008_reputation_events_trigger.test.sql) -- this
// spec is honest about testing the client only, same documented-gap
// relationship every other feature's e2e harness in this codebase has with
// a live round trip.

const ENABLED_TENANT_SESSION = {
  status: "authenticated" as const,
  rawClaims: {
    tenant_id: "11111111-1111-4111-8111-111111111111",
    role: "dealer_admin",
    red_aliados_enabled: true,
  },
};

const REJECTED_TENANT = "22222222-2222-4222-8222-222222222222";
const EXPIRED_TENANT = "33333333-3333-4333-8333-333333333333";
const UNRATED_TENANT = "44444444-4444-4444-8444-444444444444";

function seedSessionScript(seeded: unknown) {
  (window as unknown as { __RED_ALIADOS_E2E_SESSION__?: unknown }).__RED_ALIADOS_E2E_SESSION__ =
    seeded;
}

function harnessUrl(params: Record<string, string>) {
  return `/e2e-partner-reputation?${new URLSearchParams(params).toString()}`;
}

// Every one of these calls is cross-origin from the preview server's
// perspective (supabaseClient's placeholder URL is a different origin), so
// the mocked responses must carry CORS headers -- same requirement PR6's
// network-connections.spec.ts documented for its own PATCH interception,
// here for a plain GET + its OPTIONS preflight.
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,OPTIONS",
  "Access-Control-Allow-Headers": "*",
};

async function fulfillJson(route: Route, body: unknown) {
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    headers: CORS_HEADERS,
    body: JSON.stringify(body),
  });
}

async function fulfillPreflightIfNeeded(route: Route): Promise<boolean> {
  if (route.request().method() === "OPTIONS") {
    await route.fulfill({ status: 204, headers: CORS_HEADERS });
    return true;
  }
  return false;
}

// Routes reputation_events GET requests to a per-tenant fixture based on the
// `tenant_id=eq.<id>` filter PostgREST-style query param supabase-js emits
// for `.eq("tenant_id", targetTenantId)` -- mirrors the exact shape
// features/partner-reputation/data/reputation-events-queries.ts's
// fetchReputationEvents produces.
async function mockReputationEventsByTenant(
  page: import("@playwright/test").Page,
  fixtures: Record<string, unknown[]>,
) {
  await page.route("**/rest/v1/reputation_events*", async (route) => {
    if (await fulfillPreflightIfNeeded(route)) return;
    const url = new URL(route.request().url());
    const tenantFilter = url.searchParams.get("tenant_id") ?? "";
    const tenantId = tenantFilter.replace(/^eq\./, "");
    await fulfillJson(route, fixtures[tenantId] ?? []);
  });
}

test.describe("partner-reputation", () => {
  // -------------------------------------------------------------------
  // spec: "Expiry penalizes more than rejection" -- two otherwise-identical
  // requests (same elapsed response time, the full 48h window), one expired
  // and one explicitly rejected, MUST produce a lower score for the expired
  // tenant.
  // -------------------------------------------------------------------
  test("an expired outcome renders a lower reputation score than a rejected outcome with the same elapsed time", async ({
    page,
  }) => {
    await mockReputationEventsByTenant(page, {
      [REJECTED_TENANT]: [{ event_type: "rejected", response_time_seconds: 172_800 }],
      [EXPIRED_TENANT]: [{ event_type: "expired", response_time_seconds: 172_800 }],
    });

    await page.addInitScript(seedSessionScript, ENABLED_TENANT_SESSION);
    await page.goto(harnessUrl({ leftTenantId: REJECTED_TENANT, rightTenantId: EXPIRED_TENANT }));

    const rejectedBadge = page.getByTestId("reputation-left").getByTestId("reputation-badge-score");
    const expiredBadge = page.getByTestId("reputation-right").getByTestId("reputation-badge-score");

    await expect(rejectedBadge).toBeVisible();
    await expect(expiredBadge).toBeVisible();

    const rejectedScore = Number(await rejectedBadge.getAttribute("data-score"));
    const expiredScore = Number(await expiredBadge.getAttribute("data-score"));

    expect(expiredScore).toBeLessThan(rejectedScore);
  });

  // -------------------------------------------------------------------
  // spec: "Score is read-only" / a tenant with no terminal events yet is
  // "unrated", never a misleading 0.
  // -------------------------------------------------------------------
  test("a tenant with zero terminal events renders as unrated, not a 0 score", async ({ page }) => {
    await mockReputationEventsByTenant(page, { [UNRATED_TENANT]: [] });

    await page.addInitScript(seedSessionScript, ENABLED_TENANT_SESSION);
    await page.goto(harnessUrl({ leftTenantId: UNRATED_TENANT, rightTenantId: UNRATED_TENANT }));

    await expect(
      page.getByTestId("reputation-left").getByTestId("reputation-badge-unrated"),
    ).toBeVisible();
    await expect(
      page.getByTestId("reputation-left").getByTestId("reputation-badge-score"),
    ).toHaveCount(0);
  });
});
