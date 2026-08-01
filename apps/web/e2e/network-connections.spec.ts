import { expect, type Page, type Route, test } from "@playwright/test";

// Task 6.5. Same test-seam pattern as identity-bridge/network-authorization/
// tenant-directory: runs against the `build:e2e` build, seeds
// window.__RED_ALIADOS_E2E_SESSION__, and drives a dedicated harness route
// (src/routes/e2e-network-connections.tsx) that wires the REAL
// ConnectionRequestCard component + useActOnSuggestedRequest/
// useAcceptConnectionRequest/useRejectConnectionRequest/
// useConnectionEdgesForRequest hooks -- exercising the actual mutation call
// shape against `supabaseClient`.
//
// There is no live red-aliados Supabase project yet (see
// supabase/THIRD_PARTY_AUTH.md, "Status: NOT CONFIGURED"), so the two
// "accepting/rejecting" tests below intercept the underlying PostgREST calls
// via `page.route` rather than hitting a real Postgres instance. This proves
// the CLIENT wiring end-to-end (hook -> mutation call shape -> re-query ->
// render), not that the DB trigger (app.handle_connection_request_transition,
// supabase/migrations/0006_pg_cron_expire_requests.sql) itself inserts the
// reciprocal rows -- the mocked connection_edges response stands in for what
// that trigger would have produced. Same documented-gap relationship
// PR2/PR3/PR4/PR5's harnesses have with a live round trip.

const ENABLED_TENANT_SESSION = {
  status: "authenticated" as const,
  rawClaims: {
    tenant_id: "11111111-1111-4111-8111-111111111111",
    role: "dealer_admin",
    red_aliados_enabled: true,
  },
};

const REQUEST_ID = "33333333-3333-4333-8333-333333333333";
const REQUESTER_TENANT = "11111111-1111-4111-8111-111111111111";
const RECIPIENT_TENANT = "22222222-2222-4222-8222-222222222222";

function seedSessionScript(seeded: unknown) {
  (window as unknown as { __RED_ALIADOS_E2E_SESSION__?: unknown }).__RED_ALIADOS_E2E_SESSION__ =
    seeded;
}

function harnessUrl(params: Record<string, string>) {
  return `/e2e-network-connections?${new URLSearchParams(params).toString()}`;
}

// Every one of these calls is cross-origin from the preview server's
// perspective (supabaseClient's placeholder URL is a different origin), so
// the mocked responses must carry CORS headers themselves -- Playwright's
// route interception replaces the network response, but the browser still
// applies CORS to whatever comes back, including the OPTIONS preflight a
// PATCH with custom headers (apikey/Authorization) triggers.
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

async function mockZeroEdges(page: Page) {
  await page.route("**/rest/v1/connection_edges*", async (route) => {
    if (await fulfillPreflightIfNeeded(route)) return;
    await fulfillJson(route, []);
  });
}

test.describe("network-connections", () => {
  // -------------------------------------------------------------------
  // spec: "Accepted within window" -- reciprocal connection_edges rows are
  // created for BOTH tenants.
  // -------------------------------------------------------------------
  test("accepting a pending request creates reciprocal connection_edges rows in both directions", async ({
    page,
  }) => {
    let accepted = false;

    await page.route("**/rest/v1/connection_requests*", async (route) => {
      if (await fulfillPreflightIfNeeded(route)) return;
      const request = route.request();
      if (request.method() === "PATCH") {
        const patch = JSON.parse(request.postData() ?? "{}");
        accepted = patch.status === "accepted";
        await fulfillJson(route, {
          id: REQUEST_ID,
          status: patch.status,
          requester_tenant_id: REQUESTER_TENANT,
          recipient_tenant_id: RECIPIENT_TENANT,
        });
        return;
      }
      await route.continue();
    });

    await page.route("**/rest/v1/connection_edges*", async (route) => {
      if (await fulfillPreflightIfNeeded(route)) return;
      const edges = accepted
        ? [
            {
              id: "e1",
              viewer_tenant_id: REQUESTER_TENANT,
              visible_tenant_id: RECIPIENT_TENANT,
              connection_request_id: REQUEST_ID,
            },
            {
              id: "e2",
              viewer_tenant_id: RECIPIENT_TENANT,
              visible_tenant_id: REQUESTER_TENANT,
              connection_request_id: REQUEST_ID,
            },
          ]
        : [];
      await fulfillJson(route, edges);
    });

    await page.addInitScript(seedSessionScript, ENABLED_TENANT_SESSION);
    await page.goto(
      harnessUrl({
        requestId: REQUEST_ID,
        status: "pending",
        expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      }),
    );

    const card = page.getByTestId("connection-request-card");
    await expect(card).toHaveAttribute("data-status", "pending");

    await page.getByTestId("connection-request-accept-button").click();

    await expect(card).toHaveAttribute("data-status", "accepted");
    await expect(page.getByTestId("connection-request-edges-count")).toHaveText("2");
    await expect(page.getByTestId("connection-request-accept-button")).toHaveCount(0);
    await expect(page.getByTestId("connection-request-reject-button")).toHaveCount(0);
  });

  // -------------------------------------------------------------------
  // spec: "Explicitly rejected" -- no connection_edges are created.
  // -------------------------------------------------------------------
  test("rejecting a pending request leaves zero connection_edges", async ({ page }) => {
    await page.route("**/rest/v1/connection_requests*", async (route) => {
      if (await fulfillPreflightIfNeeded(route)) return;
      const request = route.request();
      if (request.method() === "PATCH") {
        const patch = JSON.parse(request.postData() ?? "{}");
        await fulfillJson(route, { id: REQUEST_ID, status: patch.status });
        return;
      }
      await route.continue();
    });

    // Never transitions to accepted in this test -- always zero edges.
    await mockZeroEdges(page);

    await page.addInitScript(seedSessionScript, ENABLED_TENANT_SESSION);
    await page.goto(
      harnessUrl({
        requestId: REQUEST_ID,
        status: "pending",
        expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      }),
    );

    const card = page.getByTestId("connection-request-card");
    await page.getByTestId("connection-request-reject-button").click();

    await expect(card).toHaveAttribute("data-status", "rejected");
    await expect(page.getByTestId("connection-request-edges-count")).toHaveText("0");
    await expect(page.getByTestId("connection-request-accept-button")).toHaveCount(0);
    await expect(page.getByTestId("connection-request-reject-button")).toHaveCount(0);
  });

  // -------------------------------------------------------------------
  // spec: "Ignored past 48 hours" -- auto-transitions to expired, no
  // connection_edges created. Proven here as the CLIENT-side optimistic
  // preview (resolveEffectiveStatus) ahead of the pg_cron sweep (task 6.3)
  // ever running -- no mutation is fired at all, this is a pure render.
  // -------------------------------------------------------------------
  test("a pending request past its 48h window renders as expired client-side, with no actions and zero edges", async ({
    page,
  }) => {
    await mockZeroEdges(page);

    await page.addInitScript(seedSessionScript, ENABLED_TENANT_SESSION);
    await page.goto(
      harnessUrl({
        requestId: REQUEST_ID,
        status: "pending",
        expiresAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      }),
    );

    const card = page.getByTestId("connection-request-card");
    await expect(card).toHaveAttribute("data-status", "expired");
    await expect(page.getByTestId("connection-request-edges-count")).toHaveText("0");
    await expect(page.getByTestId("connection-request-accept-button")).toHaveCount(0);
    await expect(page.getByTestId("connection-request-reject-button")).toHaveCount(0);
    await expect(page.getByTestId("connection-request-engage-button")).toHaveCount(0);
  });

  // -------------------------------------------------------------------
  // spec: "End-user cannot create a direct-origin request" -- a normal
  // authenticated tenant user has no path to create origin_type='direct'.
  //
  // VERIFICATION GAP, stated explicitly rather than faked -- same situation
  // PR3's network-authorization.spec.ts documented for its own skipped RLS
  // test: there is no live red-aliados Supabase project yet (see
  // supabase/THIRD_PARTY_AUTH.md, "Status: NOT CONFIGURED"). A
  // page.route-mocked response to a direct insert attempt would only prove
  // our own mock matches our own expectation -- it would NOT exercise real
  // PostgREST + RLS (insert_own_request's `origin_type in
  // ('vehicle_interest','search_match')` check, 0003_rls_policies.sql) or
  // the structural connection_requests_direct_requires_seeded_by CHECK
  // (0001_core_schema.sql). Reporting that green here would misrepresent a
  // mock as proof of server-side enforcement -- exactly the mistake PR3's
  // note warns against.
  //
  // What IS actually verified today: createConnectionRequest's own TypeScript
  // signature (features/network-connections/data/connection-requests-queries.ts)
  // is typed to ClientCreatableOriginType = Exclude<..., 'direct'>, so this
  // app's UI has no code path that can even construct a 'direct'-origin
  // insert -- verified by `pnpm -r typecheck`, not by this test.
  //
  // First action once a live Supabase project exists: un-skip this test,
  // sign in as a normal authenticated tenant user, call
  // `supabaseClient.from("connection_requests").insert({..., origin_type:
  // "direct", seeded_by: null})` directly from `page.evaluate` (bypassing
  // this app's own type restriction entirely, the same way a malicious
  // client could), and assert the real PostgREST response is a
  // policy-violation error, not a created row.
  // -------------------------------------------------------------------
  test.skip("a normal authenticated user cannot directly insert a direct-origin connection_requests row (denied by RLS)", async () => {
    // Intentionally left unimplemented -- see the VERIFICATION GAP note
    // above. Do not replace this with a mocked page.route response; that
    // would assert the mock, not RLS.
  });
});
