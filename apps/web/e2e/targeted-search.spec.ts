import { expect, type Page, type Route, test } from "@playwright/test";

// Task 9.4. Same test-seam pattern as identity-bridge/network-authorization/
// tenant-directory/network-connections/partner-reputation/connection-messaging:
// runs against the `build:e2e` build, drives a dedicated harness route
// (src/routes/e2e-targeted-search.tsx) that wires the REAL
// useSearchMatches/useOptInFanOut/useProceedOnMatch hooks + SearchMatchList
// component, and intercepts the underlying PostgREST calls via `page.route`
// -- there is no live red-aliados Supabase project yet (see
// supabase/THIRD_PARTY_AUTH.md, "Status: NOT CONFIGURED").
//
// VERIFICATION GAP, stated explicitly rather than faked -- same situation
// PR3/PR6/PR8's own skipped/documented RLS-bypass proofs: "an unconnected
// tenant never becomes a fan-out target" is fundamentally an RLS-enforcement
// guarantee (insert_own_search_request_targets's `app.is_connected(...)`
// check, supabase/migrations/0003_rls_policies.sql), which requires a live
// Postgres + PostgREST round trip to prove server-side. What IS proven here
// for real, in a real browser: the CLIENT never even ATTEMPTS to include an
// unconnected candidate tenant in the search_request_targets insert -- by
// asserting the exact request body PostgREST would have received. First
// action once a live Supabase project exists: repeat this scenario for
// real, seeding an actually-unconnected tenant and asserting the real
// PostgREST response for a smuggled row is a permission error, not a mocked
// empty connection_edges read.
//
// Also proven for real: viewing a match fires zero additional network
// requests (No Auto-Share), and proceeding fires exactly one
// search_opportunities_out insert carrying the matched tenant/vehicle ids
// (Explicit Proceed Fires Opportunity Event) -- the local event this module
// produces; there is no live V2 CRM to actually create an Opportunity in.

const TENANT_A = "11111111-1111-4111-8111-111111111111";
const TENANT_B = "22222222-2222-4222-8222-222222222222"; // connected
const TENANT_C = "33333333-3333-4333-8333-333333333333"; // NOT connected
const USER_A = "44444444-4444-4444-8444-444444444444";
const SEARCH_REQUEST_ID = "55555555-5555-4555-8555-555555555555";
const VEHICLE_NETWORK = "77777777-7777-4777-8777-777777777777";
const MATCH_CONNECTION_REQUEST_ID = "cr-match-1";

const ENABLED_SESSION = {
  status: "authenticated" as const,
  rawClaims: {
    tenant_id: TENANT_A,
    role: "dealer_admin",
    red_aliados_enabled: true,
  },
};

function seedSessionScript(seeded: unknown) {
  (window as unknown as { __RED_ALIADOS_E2E_SESSION__?: unknown }).__RED_ALIADOS_E2E_SESSION__ =
    seeded;
}

function harnessUrl(params: Record<string, string>) {
  return `/e2e-targeted-search?${new URLSearchParams(params).toString()}`;
}

// Every one of these calls is cross-origin from the preview server's
// perspective (supabaseClient's placeholder URL is a different origin), so
// the mocked responses must carry CORS headers themselves -- same pattern
// PR6/PR8's own specs established.
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS",
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

interface SetupOptions {
  readonly onSearchRequestTargetsInsert?: (body: unknown) => void;
  readonly onSearchOpportunitiesInsert?: (body: unknown) => void;
}

async function setupMocks(page: Page, options: SetupOptions = {}) {
  // Own inventory: empty, keeps this scenario focused on the fan-out flow.
  await page.route("**/rest/v1/vehicle_snapshots_public*", async (route) => {
    if (await fulfillPreflightIfNeeded(route)) return;
    await fulfillJson(route, []);
  });

  // fetchConnectedTenantIds (useOptInFanOut): only TENANT_B is connected --
  // this is the ONE source of truth the fan-out gate consults.
  await page.route("**/rest/v1/connection_edges*", async (route) => {
    if (await fulfillPreflightIfNeeded(route)) return;
    await fulfillJson(route, [{ visible_tenant_id: TENANT_B }]);
  });

  await page.route("**/rest/v1/search_requests*", async (route) => {
    if (await fulfillPreflightIfNeeded(route)) return;
    await fulfillJson(route, {
      id: SEARCH_REQUEST_ID,
      tenant_id: TENANT_A,
      requested_by: USER_A,
      criteria: {},
      status: "open",
      opted_in_fan_out: true,
      opted_in_at: "2026-08-01T12:00:00.000Z",
      created_at: "2026-08-01T11:00:00.000Z",
      updated_at: "2026-08-01T12:00:00.000Z",
    });
  });

  await page.route("**/rest/v1/search_request_targets*", async (route) => {
    if (await fulfillPreflightIfNeeded(route)) return;
    const body = route.request().postDataJSON();
    options.onSearchRequestTargetsInsert?.(body);
    const inserted = (body as { target_tenant_id: string }[]).map((row, index) => ({
      id: `t${index + 1}`,
      search_request_id: SEARCH_REQUEST_ID,
      target_tenant_id: row.target_tenant_id,
      included_at: "2026-08-01T12:00:00.000Z",
    }));
    await fulfillJson(route, inserted);
  });

  // fetchFanOutMatches: a single search_match-origin row from the connected
  // tenant (TENANT_B) -- the only tenant that could ever have received the
  // fan-out in the first place.
  await page.route("**/rest/v1/connection_requests*", async (route) => {
    if (await fulfillPreflightIfNeeded(route)) return;
    await fulfillJson(route, [
      {
        id: MATCH_CONNECTION_REQUEST_ID,
        requester_tenant_id: TENANT_B,
        recipient_tenant_id: TENANT_A,
        origin_type: "search_match",
        status: "pending",
        search_request_id: SEARCH_REQUEST_ID,
        vehicle_snapshot_id: VEHICLE_NETWORK,
      },
    ]);
  });

  await page.route("**/rest/v1/search_opportunities_out*", async (route) => {
    if (await fulfillPreflightIfNeeded(route)) return;
    const body = route.request().postDataJSON();
    options.onSearchOpportunitiesInsert?.(body);
    await fulfillJson(route, {
      id: "opp1",
      ...(body as Record<string, unknown>),
      proceeded_at: "2026-08-01T12:10:00.000Z",
      v2_opportunity_ref: null,
      created_at: "2026-08-01T12:10:00.000Z",
    });
  });
}

test.describe("targeted-search", () => {
  // -------------------------------------------------------------------
  // spec: "Fan-out limited to connected tenants" -- "Unconnected tenants'
  // vehicles MUST NOT appear." Proven here by asserting the actual
  // search_request_targets insert body, not just the rendered UI.
  // -------------------------------------------------------------------
  test("a tenant not connected to the requester never appears as a fan-out target, even though it was a candidate", async ({
    page,
  }) => {
    let insertedTargetTenantIds: string[] = [];
    await setupMocks(page, {
      onSearchRequestTargetsInsert: (body) => {
        insertedTargetTenantIds = (body as { target_tenant_id: string }[]).map(
          (row) => row.target_tenant_id,
        );
      },
    });

    await page.addInitScript(seedSessionScript, ENABLED_SESSION);
    await page.goto(
      harnessUrl({
        tenantId: TENANT_A,
        searchRequestId: SEARCH_REQUEST_ID,
        currentUserId: USER_A,
        // TENANT_C "looks" like a candidate (e.g. it has matching
        // inventory per tenant-directory) but is NOT connected to A.
        candidateTenantIds: [TENANT_B, TENANT_C].join(","),
      }),
    );

    await expect(page.getByTestId("search-match-optin-button")).toBeVisible();
    await page.getByTestId("search-match-optin-button").click();

    await expect(page.getByTestId("search-match-item")).toHaveCount(1);
    expect(insertedTargetTenantIds).toEqual([TENANT_B]);
    expect(insertedTargetTenantIds).not.toContain(TENANT_C);
  });

  // -------------------------------------------------------------------
  // spec: "Match alone does not share" -- viewing a match must not share
  // any data or fire any network request beyond what already loaded the
  // match itself.
  // -------------------------------------------------------------------
  test("viewing a match fires no additional network request and does not auto-share/reveal the vehicle", async ({
    page,
  }) => {
    let opportunityInsertCount = 0;
    await setupMocks(page, {
      onSearchOpportunitiesInsert: () => {
        opportunityInsertCount += 1;
      },
    });

    await page.addInitScript(seedSessionScript, ENABLED_SESSION);
    await page.goto(
      harnessUrl({
        tenantId: TENANT_A,
        searchRequestId: SEARCH_REQUEST_ID,
        currentUserId: USER_A,
        candidateTenantIds: TENANT_B,
      }),
    );
    await page.getByTestId("search-match-optin-button").click();
    await expect(page.getByTestId("search-match-item")).toHaveCount(1);

    const proceedButton = page.getByTestId("search-match-proceed-button");
    await expect(proceedButton).toBeDisabled();

    let requestCountDuringView = 0;
    page.on("request", () => {
      requestCountDuringView += 1;
    });
    await page.getByTestId("search-match-view-button").click();

    // Viewing is a pure client-side state flip -- no network call at all.
    expect(requestCountDuringView).toBe(0);
    expect(opportunityInsertCount).toBe(0);
    await expect(proceedButton).toBeEnabled();
  });

  // -------------------------------------------------------------------
  // spec: "Proceeding creates a V2 Opportunity" -- proven here as the
  // LOCAL event/row this module actually produces
  // (search_opportunities_out), not a live V2 CRM round trip (none
  // exists in this sandbox -- see this file's own header).
  // -------------------------------------------------------------------
  test("explicitly proceeding on a viewed match fires exactly one search_opportunities_out insert", async ({
    page,
  }) => {
    let opportunityInsertBody: Record<string, unknown> | null = null;
    await setupMocks(page, {
      onSearchOpportunitiesInsert: (body) => {
        opportunityInsertBody = body as Record<string, unknown>;
      },
    });

    await page.addInitScript(seedSessionScript, ENABLED_SESSION);
    await page.goto(
      harnessUrl({
        tenantId: TENANT_A,
        searchRequestId: SEARCH_REQUEST_ID,
        currentUserId: USER_A,
        candidateTenantIds: TENANT_B,
      }),
    );
    await page.getByTestId("search-match-optin-button").click();
    await expect(page.getByTestId("search-match-item")).toHaveCount(1);

    await page.getByTestId("search-match-view-button").click();
    await page.getByTestId("search-match-proceed-button").click();

    await expect(page.getByTestId("targeted-search-opportunity-created")).toBeVisible();
    expect(opportunityInsertBody).toEqual({
      search_request_id: SEARCH_REQUEST_ID,
      vehicle_snapshot_id: VEHICLE_NETWORK,
      matched_tenant_id: TENANT_B,
      proceeded_by: USER_A,
    });
  });
});
