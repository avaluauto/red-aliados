import { expect, type Page, type Route, test } from "@playwright/test";

// Task 8.4. Same test-seam pattern as identity-bridge/network-authorization/
// tenant-directory/network-connections/partner-reputation: runs against the
// `build:e2e` build, drives a dedicated harness route
// (src/routes/e2e-connection-messaging.tsx) that wires the REAL
// useConnectionMessagesThread/useSendConnectionMessage hooks + MessageThread
// component, and intercepts the underlying PostgREST calls via `page.route`
// -- there is no live red-aliados Supabase project yet (see
// supabase/THIRD_PARTY_AUTH.md, "Status: NOT CONFIGURED").
//
// VERIFICATION GAP, stated explicitly rather than faked -- same situation
// PR3/PR6's own skipped/documented RLS-bypass proofs: "a third tenant cannot
// read a thread" is fundamentally an RLS-enforcement guarantee
// (select_own_connection_requests/select_own_thread_messages,
// supabase/migrations/0003_rls_policies.sql), which requires a live Postgres
// + PostgREST round trip to prove server-side. What IS proven here for
// real, in a real browser, is the CLIENT-side half of task 8.2's exact
// requirement -- "the client only ever subscribes to requests it's actually
// part of" -- by mocking the connection_requests party-check response the
// way RLS would produce it for a non-party caller (an empty result set) and
// asserting the client (a) renders no access to the thread and (b) never
// even issues a request to the connection_messages endpoint at all. First
// action once a live Supabase project exists: repeat this scenario signed
// in as a genuine third tenant, calling supabaseClient directly (bypassing
// this app's own UI/hooks entirely) and asserting the real PostgREST
// response is an empty result, not a mocked one.

const REQUEST_ID = "33333333-3333-4333-8333-333333333333";
const TENANT_A = "11111111-1111-4111-8111-111111111111";
const TENANT_B = "22222222-2222-4222-8222-222222222222";
const USER_A = "44444444-4444-4444-8444-444444444444";

// The root layout gates every route behind identity-bridge's IdentityGate
// (see src/routes/__root.tsx) -- the harness route only ever renders once a
// session is seeded, same as every other e2e-only harness in this repo.
// The seeded tenant_id is unrelated to the connection-messaging scenario
// itself (useConnectionMessagesThread never reads session claims -- it is
// driven purely by requestId + the party-check response), only
// `red_aliados_enabled: true` matters here.
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
  return `/e2e-connection-messaging?${new URLSearchParams(params).toString()}`;
}

// Every one of these calls is cross-origin from the preview server's
// perspective (supabaseClient's placeholder URL is a different origin), so
// the mocked responses must carry CORS headers themselves -- same pattern
// PR6's network-connections.spec.ts established.
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

async function mockConnectionRequestParty(page: Page, row: Record<string, unknown> | null) {
  await page.route("**/rest/v1/connection_requests*", async (route) => {
    if (await fulfillPreflightIfNeeded(route)) return;
    // PostgREST's own `.maybeSingle()` semantics: an empty array is "no row"
    // (RLS filtered it out), a one-element array is the single matching row.
    await fulfillJson(route, row ? [row] : []);
  });
}

test.describe("connection-messaging", () => {
  // -------------------------------------------------------------------
  // spec: "No contact shown while pending".
  // -------------------------------------------------------------------
  test("a participant sees the thread with the counterpart's contact hidden while the request is pending", async ({
    page,
  }) => {
    await mockConnectionRequestParty(page, {
      id: REQUEST_ID,
      requester_tenant_id: TENANT_A,
      recipient_tenant_id: TENANT_B,
      status: "pending",
    });
    await page.route("**/rest/v1/connection_messages*", async (route) => {
      if (await fulfillPreflightIfNeeded(route)) return;
      await fulfillJson(route, [
        {
          id: "m1",
          connection_request_id: REQUEST_ID,
          sender_tenant_id: TENANT_A,
          sender_user_id: USER_A,
          body: "Hi, is this vehicle still available?",
          created_at: "2026-08-01T12:00:00.000Z",
        },
      ]);
    });

    await page.addInitScript(seedSessionScript, ENABLED_SESSION);
    await page.goto(
      harnessUrl({
        requestId: REQUEST_ID,
        currentTenantId: TENANT_A,
        currentUserId: USER_A,
        contactPhone: "+52 55 1234 5678",
      }),
    );

    await expect(page.getByTestId("message-thread")).toBeVisible();
    await expect(page.getByTestId("message-thread-message")).toHaveText(
      "Hi, is this vehicle still available?",
    );
    await expect(page.getByTestId("message-thread-contact-masked")).toBeVisible();
    await expect(page.getByTestId("message-thread-contact")).toHaveCount(0);
    await expect(page.getByText("+52 55 1234 5678")).toHaveCount(0);
  });

  // -------------------------------------------------------------------
  // spec: "Contact appears after acceptance".
  // -------------------------------------------------------------------
  test("a participant sees the counterpart's contact once the request is accepted", async ({
    page,
  }) => {
    await mockConnectionRequestParty(page, {
      id: REQUEST_ID,
      requester_tenant_id: TENANT_A,
      recipient_tenant_id: TENANT_B,
      status: "accepted",
    });
    await page.route("**/rest/v1/connection_messages*", async (route) => {
      if (await fulfillPreflightIfNeeded(route)) return;
      await fulfillJson(route, []);
    });

    await page.addInitScript(seedSessionScript, ENABLED_SESSION);
    await page.goto(
      harnessUrl({
        requestId: REQUEST_ID,
        currentTenantId: TENANT_A,
        currentUserId: USER_A,
        contactPhone: "+52 55 1234 5678",
      }),
    );

    await expect(page.getByTestId("message-thread-contact")).toHaveText("+52 55 1234 5678");
    await expect(page.getByTestId("message-thread-contact-masked")).toHaveCount(0);
  });

  // -------------------------------------------------------------------
  // spec: "no third tenant can read the thread" -- CLIENT-side half only,
  // see this file's own header for the documented verification gap.
  // -------------------------------------------------------------------
  test("a third, uninvolved tenant gets no access to the thread and the client never queries connection_messages at all", async ({
    page,
  }) => {
    // Simulates exactly what select_own_connection_requests (0003) would
    // return for a caller who is neither requester nor recipient: zero rows.
    await mockConnectionRequestParty(page, null);

    let messagesRequestCount = 0;
    await page.route("**/rest/v1/connection_messages*", async (route) => {
      if (await fulfillPreflightIfNeeded(route)) return;
      messagesRequestCount += 1;
      await fulfillJson(route, []);
    });

    const THIRD_TENANT = "55555555-5555-4555-8555-555555555555";
    const THIRD_USER = "66666666-6666-4666-8666-666666666666";

    await page.addInitScript(seedSessionScript, ENABLED_SESSION);
    await page.goto(
      harnessUrl({
        requestId: REQUEST_ID,
        currentTenantId: THIRD_TENANT,
        currentUserId: THIRD_USER,
        contactPhone: "+52 55 1234 5678",
      }),
    );

    await expect(page.getByTestId("message-thread-no-access")).toBeVisible();
    await expect(page.getByTestId("message-thread")).toHaveCount(0);
    await expect(page.getByTestId("message-thread-message")).toHaveCount(0);
    await expect(page.getByText("+52 55 1234 5678")).toHaveCount(0);

    // task 8.2's exact requirement: the client only ever subscribes to (and
    // reads messages from) requests it's actually part of -- proven here by
    // the absence of any request to the messages endpoint at all, not just
    // an empty rendered list.
    expect(messagesRequestCount).toBe(0);
  });
});
