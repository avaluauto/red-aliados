import { beforeEach, describe, expect, it, vi } from "vitest";

const from = vi.fn();

vi.mock("@/features/identity-bridge", () => ({
  supabaseClient: {
    from: (table: string) => from(table),
  },
}));

// Same minimal fluent Supabase mock as connection-messages-queries.test.ts /
// connection-requests-queries.test.ts -- every chain method returns the same
// object, terminal methods resolve a promise, and the whole thing is itself
// thenable for a non-`.single()`/`.maybeSingle()` read.
function makeBuilder(result: { data: unknown; error: unknown }) {
  const promise = Promise.resolve(result);
  const builder: Record<string, unknown> = {
    select: vi.fn(() => builder),
    insert: vi.fn(() => builder),
    update: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    is: vi.fn(() => builder),
    single: vi.fn(() => promise),
    maybeSingle: vi.fn(() => promise),
    // biome-ignore lint/suspicious/noThenProperty: intentional thenable test double, mirrors Supabase's real awaitable PostgrestFilterBuilder
    then: promise.then.bind(promise),
    catch: promise.catch.bind(promise),
    finally: promise.finally.bind(promise),
  };
  return builder;
}

const TENANT_A = "11111111-1111-4111-8111-111111111111";
const TENANT_B = "22222222-2222-4222-8222-222222222222";
const TENANT_C = "33333333-3333-4333-8333-333333333333";
const USER_A = "44444444-4444-4444-8444-444444444444";
const SEARCH_REQUEST_ID = "55555555-5555-4555-8555-555555555555";
const VEHICLE_ID = "66666666-6666-4666-8666-666666666666";

beforeEach(() => {
  from.mockReset();
});

describe("createSearchRequest", () => {
  it("inserts a search_requests row scoped to the requesting tenant/user", async () => {
    const row = {
      id: SEARCH_REQUEST_ID,
      tenant_id: TENANT_A,
      requested_by: USER_A,
      criteria: { make: "Toyota" },
      status: "open",
      opted_in_fan_out: false,
      opted_in_at: null,
      created_at: "2026-08-01T12:00:00.000Z",
      updated_at: "2026-08-01T12:00:00.000Z",
    };
    const builder = makeBuilder({ data: row, error: null });
    from.mockReturnValue(builder);

    const { createSearchRequest } = await import("./targeted-search-queries");
    const result = await createSearchRequest({
      tenantId: TENANT_A,
      requestedBy: USER_A,
      criteria: { make: "Toyota" },
    });

    expect(from).toHaveBeenCalledWith("search_requests");
    expect(builder.insert).toHaveBeenCalledWith({
      tenant_id: TENANT_A,
      requested_by: USER_A,
      criteria: { make: "Toyota" },
    });
    expect(result).toEqual(row);
  });

  it("throws (does not swallow) when the insert is rejected -- e.g. by RLS", async () => {
    from.mockReturnValue(makeBuilder({ data: null, error: new Error("permission denied") }));

    const { createSearchRequest } = await import("./targeted-search-queries");
    await expect(
      createSearchRequest({ tenantId: TENANT_A, requestedBy: USER_A, criteria: {} }),
    ).rejects.toThrow("permission denied");
  });
});

describe("fetchOwnInventoryVehicles", () => {
  it("reads through vehicle_snapshots_public scoped to the caller's own tenant", async () => {
    const rows = [{ id: VEHICLE_ID, tenant_id: TENANT_A, make: "Toyota", model: "Corolla" }];
    const builder = makeBuilder({ data: rows, error: null });
    from.mockReturnValue(builder);

    const { fetchOwnInventoryVehicles } = await import("./targeted-search-queries");
    const result = await fetchOwnInventoryVehicles(TENANT_A);

    expect(from).toHaveBeenCalledWith("vehicle_snapshots_public");
    expect(builder.eq).toHaveBeenCalledWith("tenant_id", TENANT_A);
    expect(result).toEqual(rows);
  });

  it("returns an empty array (never throws) on a query error", async () => {
    from.mockReturnValue(makeBuilder({ data: null, error: new Error("boom") }));

    const { fetchOwnInventoryVehicles } = await import("./targeted-search-queries");
    expect(await fetchOwnInventoryVehicles(TENANT_A)).toEqual([]);
  });
});

describe("fetchConnectedTenantIds", () => {
  // Reuses connection_edges -- the exact same table/RLS pattern
  // network-connections/tenant-directory already established
  // (select_own_connection_edges, 0003_rls_policies.sql) -- rather than
  // reinventing a parallel "who am I connected to" query.
  it("reads active connection_edges rows and returns the visible tenant ids", async () => {
    const rows = [{ visible_tenant_id: TENANT_B }, { visible_tenant_id: TENANT_C }];
    const builder = makeBuilder({ data: rows, error: null });
    from.mockReturnValue(builder);

    const { fetchConnectedTenantIds } = await import("./targeted-search-queries");
    const result = await fetchConnectedTenantIds();

    expect(from).toHaveBeenCalledWith("connection_edges");
    expect(builder.is).toHaveBeenCalledWith("revoked_at", null);
    expect(result).toEqual([TENANT_B, TENANT_C]);
  });

  it("returns an empty array (never throws) on a query error", async () => {
    from.mockReturnValue(makeBuilder({ data: null, error: new Error("boom") }));

    const { fetchConnectedTenantIds } = await import("./targeted-search-queries");
    expect(await fetchConnectedTenantIds()).toEqual([]);
  });
});

describe("optInToFanOut", () => {
  it("marks the search_requests row opted-in and inserts a search_request_targets row per connected tenant only", async () => {
    const updatedRequest = {
      id: SEARCH_REQUEST_ID,
      tenant_id: TENANT_A,
      requested_by: USER_A,
      criteria: {},
      status: "open",
      opted_in_fan_out: true,
      opted_in_at: "2026-08-01T12:05:00.000Z",
      created_at: "2026-08-01T12:00:00.000Z",
      updated_at: "2026-08-01T12:05:00.000Z",
    };
    const insertedTargets = [
      { id: "t1", search_request_id: SEARCH_REQUEST_ID, target_tenant_id: TENANT_B },
    ];

    const updateBuilder = makeBuilder({ data: updatedRequest, error: null });
    const insertBuilder = makeBuilder({ data: insertedTargets, error: null });
    from.mockImplementation((table: string) =>
      table === "search_requests" ? updateBuilder : insertBuilder,
    );

    const { optInToFanOut } = await import("./targeted-search-queries");
    // Candidate list includes an unconnected tenant (TENANT_C) -- the
    // caller is expected to have already filtered via
    // domain/search-matching.ts's filterConnectedFanOutTargets, but this
    // function only ever receives the already-filtered, connected-only list.
    const result = await optInToFanOut(SEARCH_REQUEST_ID, [TENANT_B]);

    expect(from).toHaveBeenCalledWith("search_requests");
    expect(updateBuilder.update).toHaveBeenCalledWith(
      expect.objectContaining({ opted_in_fan_out: true }),
    );
    expect(from).toHaveBeenCalledWith("search_request_targets");
    expect(insertBuilder.insert).toHaveBeenCalledWith([
      { search_request_id: SEARCH_REQUEST_ID, target_tenant_id: TENANT_B },
    ]);
    expect(result).toEqual({ searchRequest: updatedRequest, targets: insertedTargets });
  });

  it("does not insert any search_request_targets row when the connected target list is empty", async () => {
    const updatedRequest = {
      id: SEARCH_REQUEST_ID,
      tenant_id: TENANT_A,
      requested_by: USER_A,
      criteria: {},
      status: "open",
      opted_in_fan_out: true,
      opted_in_at: "2026-08-01T12:05:00.000Z",
      created_at: "2026-08-01T12:00:00.000Z",
      updated_at: "2026-08-01T12:05:00.000Z",
    };
    const updateBuilder = makeBuilder({ data: updatedRequest, error: null });
    from.mockReturnValue(updateBuilder);

    const { optInToFanOut } = await import("./targeted-search-queries");
    const result = await optInToFanOut(SEARCH_REQUEST_ID, []);

    expect(from).toHaveBeenCalledTimes(1);
    expect(from).toHaveBeenCalledWith("search_requests");
    expect(result).toEqual({ searchRequest: updatedRequest, targets: [] });
  });

  it("throws when the opt-in update is rejected", async () => {
    from.mockReturnValue(makeBuilder({ data: null, error: new Error("permission denied") }));

    const { optInToFanOut } = await import("./targeted-search-queries");
    await expect(optInToFanOut(SEARCH_REQUEST_ID, [TENANT_B])).rejects.toThrow("permission denied");
  });
});

describe("fetchFanOutMatches", () => {
  it("reads search_match-origin connection_requests rows scoped to the search request", async () => {
    const rows = [
      {
        id: "cr1",
        requester_tenant_id: TENANT_B,
        recipient_tenant_id: TENANT_A,
        origin_type: "search_match",
        status: "pending",
        search_request_id: SEARCH_REQUEST_ID,
        vehicle_snapshot_id: VEHICLE_ID,
      },
    ];
    const builder = makeBuilder({ data: rows, error: null });
    from.mockReturnValue(builder);

    const { fetchFanOutMatches } = await import("./targeted-search-queries");
    const result = await fetchFanOutMatches(SEARCH_REQUEST_ID);

    expect(from).toHaveBeenCalledWith("connection_requests");
    expect(builder.eq).toHaveBeenCalledWith("search_request_id", SEARCH_REQUEST_ID);
    expect(builder.eq).toHaveBeenCalledWith("origin_type", "search_match");
    expect(result).toEqual(rows);
  });

  it("returns an empty array (never throws) on a query error", async () => {
    from.mockReturnValue(makeBuilder({ data: null, error: new Error("boom") }));

    const { fetchFanOutMatches } = await import("./targeted-search-queries");
    expect(await fetchFanOutMatches(SEARCH_REQUEST_ID)).toEqual([]);
  });
});

describe("respondWithMatch", () => {
  // "tengo algo similar": the responding (match-owner) tenant is the
  // REQUESTER of a new connection_requests row targeting the original
  // searcher as recipient -- reuses network-connections'
  // createConnectionRequest rather than reinventing an insert (additive
  // composition, same pattern connection-messaging reused
  // ConnectionRequestStatus from network-connections).
  it("creates a search_match-origin connection request from the match owner to the original requester", async () => {
    const row = {
      id: "cr1",
      requester_tenant_id: TENANT_B,
      recipient_tenant_id: TENANT_A,
      origin_type: "search_match",
      status: "pending",
      search_request_id: SEARCH_REQUEST_ID,
      vehicle_snapshot_id: VEHICLE_ID,
    };
    const builder = makeBuilder({ data: row, error: null });
    from.mockReturnValue(builder);

    const { respondWithMatch } = await import("./targeted-search-queries");
    const result = await respondWithMatch({
      searchRequestId: SEARCH_REQUEST_ID,
      matchOwnerTenantId: TENANT_B,
      originalRequesterTenantId: TENANT_A,
      matchOwnerUserId: USER_A,
      vehicleSnapshotId: VEHICLE_ID,
    });

    expect(from).toHaveBeenCalledWith("connection_requests");
    expect(builder.insert).toHaveBeenCalledWith({
      requester_tenant_id: TENANT_B,
      recipient_tenant_id: TENANT_A,
      origin_type: "search_match",
      requested_by: USER_A,
      vehicle_snapshot_id: VEHICLE_ID,
      search_request_id: SEARCH_REQUEST_ID,
    });
    expect(result).toEqual(row);
  });
});

describe("proceedOnMatch", () => {
  it("inserts a search_opportunities_out row -- the event that triggers V2 Opportunity creation", async () => {
    const row = {
      id: "opp1",
      search_request_id: SEARCH_REQUEST_ID,
      vehicle_snapshot_id: VEHICLE_ID,
      matched_tenant_id: TENANT_B,
      proceeded_by: USER_A,
      proceeded_at: "2026-08-01T12:10:00.000Z",
      v2_opportunity_ref: null,
      created_at: "2026-08-01T12:10:00.000Z",
    };
    const builder = makeBuilder({ data: row, error: null });
    from.mockReturnValue(builder);

    const { proceedOnMatch } = await import("./targeted-search-queries");
    const result = await proceedOnMatch({
      searchRequestId: SEARCH_REQUEST_ID,
      vehicleSnapshotId: VEHICLE_ID,
      matchedTenantId: TENANT_B,
      proceededBy: USER_A,
    });

    expect(from).toHaveBeenCalledWith("search_opportunities_out");
    expect(builder.insert).toHaveBeenCalledWith({
      search_request_id: SEARCH_REQUEST_ID,
      vehicle_snapshot_id: VEHICLE_ID,
      matched_tenant_id: TENANT_B,
      proceeded_by: USER_A,
    });
    expect(result).toEqual(row);
  });

  it("throws (does not swallow) when the insert is rejected -- e.g. proceeding on an unreachable tenant", async () => {
    from.mockReturnValue(makeBuilder({ data: null, error: new Error("permission denied") }));

    const { proceedOnMatch } = await import("./targeted-search-queries");
    await expect(
      proceedOnMatch({
        searchRequestId: SEARCH_REQUEST_ID,
        vehicleSnapshotId: VEHICLE_ID,
        matchedTenantId: TENANT_B,
        proceededBy: USER_A,
      }),
    ).rejects.toThrow("permission denied");
  });
});
