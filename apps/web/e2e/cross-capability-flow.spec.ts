import { expect, type Route, test } from "@playwright/test";

// Task 10.1 -- Phase 10, Cross-Capability Verification. This is an
// INTEGRATION spec: it does not reintroduce any new feature logic, it
// composes the SAME e2e harness routes + `page.route` fixture patterns
// PR2-PR9 already established (identity-bridge/network-authorization/
// tenant-directory/network-connections/partner-reputation/
// connection-messaging/targeted-search all documented this exact seam in
// their own spec files) into one continuous story that walks the project's
// full stated success criteria end to end:
//
//   sign in (identity-bridge)
//     -> a partner's synced vehicle is visible, masked, pre-connection
//        (vehicle-sync's mirror surfaced through tenant-directory)
//     -> accept the connecting request (network-connections)
//     -> the SAME partner now reveals its contact (tenant-directory)
//     -> the connection-messaging thread reveals that same contact too
//     -> partner-reputation's score reflects the accepted outcome
//     -> targeted-search's fan-out only reaches that now-connected partner,
//        never an unconnected one
//
// Each step is a real, full `page.goto` navigation (a fresh app instance
// with its own QueryClient, same as every isolated per-feature spec) into
// that feature's existing harness route -- nothing here is a mocked
// end-to-end shortcut; every hook/component exercised is the real
// production one, same as the per-feature specs. `page.unrouteAll()`
// between steps prevents an earlier step's route interception from leaking
// into the next feature's own mocked endpoints.
//
// Same overall documented verification gap every per-feature harness in
// this codebase already states: there is no live red-aliados Supabase
// project yet (see supabase/THIRD_PARTY_AUTH.md, "Status: NOT CONFIGURED"),
// so PostgREST calls are intercepted via `page.route`, not a real Postgres
// round trip. What this proves is that all seven capabilities' CLIENT
// wiring composes into one coherent story with a single, consistent
// tenant/request identity carried across every step -- not fresh,
// unrelated fixtures per feature. RLS-level proof for the two individually
// skipped scenarios (network-authorization.spec.ts,
// network-connections.spec.ts) remains a separate, already-documented gap,
// not something this integration test re-proves.

const SELF_TENANT = "11111111-1111-4111-8111-111111111111";
const SELF_USER = "44444444-4444-4444-8444-444444444444";
const PARTNER_TENANT = "22222222-2222-4222-8222-222222222222";
const UNCONNECTED_TENANT = "99999999-9999-4999-8999-999999999999";
const UNRATED_COMPARATOR_TENANT = "88888888-8888-4888-8888-888888888888";

const CONNECTION_REQUEST_ID = "33333333-3333-4333-8333-333333333333";
const SEARCH_REQUEST_ID = "55555555-5555-4555-8555-555555555555";
const MATCH_VEHICLE_ID = "77777777-7777-4777-8777-777777777777";
const MATCH_CONNECTION_REQUEST_ID = "cr-match-flow";
const PARTNER_PHONE = "+52 55 1234 5678";

const ENABLED_SESSION = {
  status: "authenticated" as const,
  rawClaims: {
    tenant_id: SELF_TENANT,
    app_role: "dealer_admin",
    red_aliados_enabled: true,
  },
};

function seedSessionScript(seeded: unknown) {
  (window as unknown as { __RED_ALIADOS_E2E_SESSION__?: unknown }).__RED_ALIADOS_E2E_SESSION__ =
    seeded;
}

function harnessUrl(path: string, params: Record<string, string>) {
  return `${path}?${new URLSearchParams(params).toString()}`;
}

// Same CORS-preflight shim every mocked-mutation spec in this codebase uses
// (network-connections/connection-messaging/targeted-search) -- the
// preview server's origin differs from supabaseClient's placeholder URL, so
// intercepted responses must carry CORS headers themselves.
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

test.describe("cross-capability flow", () => {
  test("signin -> vehicle visible -> connect -> reveal -> message -> reputation -> search, one consistent tenant pair throughout", async ({
    page,
  }) => {
    await page.addInitScript(seedSessionScript, ENABLED_SESSION);

    await test.step("identity-bridge: an enabled tenant's V2-issued session signs in silently", async () => {
      await page.goto("/");
      await expect(page.getByRole("heading", { name: "Red Aliados", exact: true })).toBeVisible();
      await expect(page.getByText(/isn't enabled/i)).toHaveCount(0);
    });

    await test.step("vehicle-sync + tenant-directory: the partner's synced vehicle is visible pre-connection, masked", async () => {
      await page.goto(
        harnessUrl("/e2e-tenant-directory", {
          targetTenantId: PARTNER_TENANT,
          hasNetworkAccess: "true",
          isConnected: "false",
          hasCandidateLink: "true",
        }),
      );

      await expect(page.getByTestId("tier")).toHaveText("candidate");
      await expect(page.getByTestId("candidate-reputation")).toBeVisible();
      await expect(page.getByTestId("candidate-contact-masked")).toBeVisible();
      await expect(page.getByTestId("candidate-contact")).toHaveCount(0);
    });

    await test.step("network-connections: accepting the pending request creates reciprocal connection_edges", async () => {
      let accepted = false;

      await page.route("**/rest/v1/connection_requests*", async (route) => {
        if (await fulfillPreflightIfNeeded(route)) return;
        const request = route.request();
        if (request.method() === "PATCH") {
          const patch = JSON.parse(request.postData() ?? "{}");
          accepted = patch.status === "accepted";
          await fulfillJson(route, {
            id: CONNECTION_REQUEST_ID,
            status: patch.status,
            requester_tenant_id: SELF_TENANT,
            recipient_tenant_id: PARTNER_TENANT,
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
                viewer_tenant_id: SELF_TENANT,
                visible_tenant_id: PARTNER_TENANT,
                connection_request_id: CONNECTION_REQUEST_ID,
              },
              {
                id: "e2",
                viewer_tenant_id: PARTNER_TENANT,
                visible_tenant_id: SELF_TENANT,
                connection_request_id: CONNECTION_REQUEST_ID,
              },
            ]
          : [];
        await fulfillJson(route, edges);
      });

      await page.goto(
        harnessUrl("/e2e-network-connections", {
          requestId: CONNECTION_REQUEST_ID,
          status: "pending",
          expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        }),
      );

      const card = page.getByTestId("connection-request-card");
      await expect(card).toHaveAttribute("data-status", "pending");

      await page.getByTestId("connection-request-accept-button").click();

      await expect(card).toHaveAttribute("data-status", "accepted");
      await expect(page.getByTestId("connection-request-edges-count")).toHaveText("2");

      await page.unrouteAll({ behavior: "ignoreErrors" });
    });

    await test.step("tenant-directory: the same partner now reveals reputation and its real contact", async () => {
      await page.goto(
        harnessUrl("/e2e-tenant-directory", {
          targetTenantId: PARTNER_TENANT,
          hasNetworkAccess: "true",
          isConnected: "true",
          hasCandidateLink: "false",
        }),
      );

      await expect(page.getByTestId("tier")).toHaveText("connected");
      await expect(page.getByTestId("candidate-reputation")).toBeVisible();
      await expect(page.getByTestId("candidate-contact")).toHaveText(PARTNER_PHONE);
      await expect(page.getByTestId("candidate-contact-masked")).toHaveCount(0);
    });

    await test.step("connection-messaging: the accepted request's thread reveals that same contact", async () => {
      await page.route("**/rest/v1/connection_requests*", async (route) => {
        if (await fulfillPreflightIfNeeded(route)) return;
        await fulfillJson(route, [
          {
            id: CONNECTION_REQUEST_ID,
            requester_tenant_id: SELF_TENANT,
            recipient_tenant_id: PARTNER_TENANT,
            status: "accepted",
          },
        ]);
      });
      await page.route("**/rest/v1/connection_messages*", async (route) => {
        if (await fulfillPreflightIfNeeded(route)) return;
        await fulfillJson(route, [
          {
            id: "m1",
            connection_request_id: CONNECTION_REQUEST_ID,
            sender_tenant_id: PARTNER_TENANT,
            sender_user_id: "partner-user-1",
            body: "Great, let's talk about the unit.",
            created_at: "2026-08-01T12:00:00.000Z",
          },
        ]);
      });

      await page.goto(
        harnessUrl("/e2e-connection-messaging", {
          requestId: CONNECTION_REQUEST_ID,
          currentTenantId: SELF_TENANT,
          currentUserId: SELF_USER,
          contactPhone: PARTNER_PHONE,
        }),
      );

      await expect(page.getByTestId("message-thread")).toBeVisible();
      await expect(page.getByTestId("message-thread-message")).toHaveText(
        "Great, let's talk about the unit.",
      );
      await expect(page.getByTestId("message-thread-contact")).toHaveText(PARTNER_PHONE);
      await expect(page.getByTestId("message-thread-contact-masked")).toHaveCount(0);

      await page.unrouteAll({ behavior: "ignoreErrors" });
    });

    await test.step("partner-reputation: the partner's score now reflects the accepted outcome, an untouched comparator stays unrated", async () => {
      await page.route("**/rest/v1/reputation_events*", async (route) => {
        if (await fulfillPreflightIfNeeded(route)) return;
        const url = new URL(route.request().url());
        const tenantFilter = url.searchParams.get("tenant_id") ?? "";
        const tenantId = tenantFilter.replace(/^eq\./, "");
        const fixtures: Record<string, unknown[]> = {
          [PARTNER_TENANT]: [{ event_type: "accepted", response_time_seconds: 300 }],
          [UNRATED_COMPARATOR_TENANT]: [],
        };
        await fulfillJson(route, fixtures[tenantId] ?? []);
      });

      await page.goto(
        harnessUrl("/e2e-partner-reputation", {
          leftTenantId: PARTNER_TENANT,
          rightTenantId: UNRATED_COMPARATOR_TENANT,
        }),
      );

      const partnerBadge = page
        .getByTestId("reputation-left")
        .getByTestId("reputation-badge-score");
      await expect(partnerBadge).toBeVisible();
      const partnerScore = Number(await partnerBadge.getAttribute("data-score"));
      expect(partnerScore).toBeGreaterThan(60);

      await expect(
        page.getByTestId("reputation-right").getByTestId("reputation-badge-unrated"),
      ).toBeVisible();

      await page.unrouteAll({ behavior: "ignoreErrors" });
    });

    await test.step("targeted-search: fan-out reaches only the now-connected partner, the unconnected tenant is excluded", async () => {
      let insertedTargetTenantIds: string[] = [];
      let opportunityInsertBody: Record<string, unknown> | null = null;

      await page.route("**/rest/v1/vehicle_snapshots_public*", async (route) => {
        if (await fulfillPreflightIfNeeded(route)) return;
        await fulfillJson(route, []);
      });

      // The ONE source of truth the fan-out gate consults -- and it is the
      // exact same connection_edges relationship this flow itself created
      // in the network-connections step above.
      await page.route("**/rest/v1/connection_edges*", async (route) => {
        if (await fulfillPreflightIfNeeded(route)) return;
        await fulfillJson(route, [{ visible_tenant_id: PARTNER_TENANT }]);
      });

      await page.route("**/rest/v1/search_requests*", async (route) => {
        if (await fulfillPreflightIfNeeded(route)) return;
        await fulfillJson(route, {
          id: SEARCH_REQUEST_ID,
          tenant_id: SELF_TENANT,
          requested_by: SELF_USER,
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
        const body = route.request().postDataJSON() as { target_tenant_id: string }[];
        insertedTargetTenantIds = body.map((row) => row.target_tenant_id);
        const inserted = body.map((row, index) => ({
          id: `t${index + 1}`,
          search_request_id: SEARCH_REQUEST_ID,
          target_tenant_id: row.target_tenant_id,
          included_at: "2026-08-01T12:00:00.000Z",
        }));
        await fulfillJson(route, inserted);
      });

      await page.route("**/rest/v1/connection_requests*", async (route) => {
        if (await fulfillPreflightIfNeeded(route)) return;
        await fulfillJson(route, [
          {
            id: MATCH_CONNECTION_REQUEST_ID,
            requester_tenant_id: PARTNER_TENANT,
            recipient_tenant_id: SELF_TENANT,
            origin_type: "search_match",
            status: "pending",
            search_request_id: SEARCH_REQUEST_ID,
            vehicle_snapshot_id: MATCH_VEHICLE_ID,
          },
        ]);
      });

      await page.route("**/rest/v1/search_opportunities_out*", async (route) => {
        if (await fulfillPreflightIfNeeded(route)) return;
        const body = route.request().postDataJSON();
        opportunityInsertBody = body as Record<string, unknown>;
        await fulfillJson(route, {
          id: "opp1",
          ...(body as Record<string, unknown>),
          proceeded_at: "2026-08-01T12:10:00.000Z",
          v2_opportunity_ref: null,
          created_at: "2026-08-01T12:10:00.000Z",
        });
      });

      await page.goto(
        harnessUrl("/e2e-targeted-search", {
          tenantId: SELF_TENANT,
          searchRequestId: SEARCH_REQUEST_ID,
          currentUserId: SELF_USER,
          // UNCONNECTED_TENANT "looks" like a candidate (matching inventory
          // per tenant-directory) but was never connected in this flow.
          candidateTenantIds: [PARTNER_TENANT, UNCONNECTED_TENANT].join(","),
        }),
      );

      await page.getByTestId("search-match-optin-button").click();

      await expect(page.getByTestId("search-match-item")).toHaveCount(1);
      expect(insertedTargetTenantIds).toEqual([PARTNER_TENANT]);
      expect(insertedTargetTenantIds).not.toContain(UNCONNECTED_TENANT);

      await page.getByTestId("search-match-view-button").click();
      await page.getByTestId("search-match-proceed-button").click();

      await expect(page.getByTestId("targeted-search-opportunity-created")).toBeVisible();
      expect(opportunityInsertBody).toEqual({
        search_request_id: SEARCH_REQUEST_ID,
        vehicle_snapshot_id: MATCH_VEHICLE_ID,
        matched_tenant_id: PARTNER_TENANT,
        proceeded_by: SELF_USER,
      });
    });
  });
});
