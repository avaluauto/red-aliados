import { beforeEach, describe, expect, it, vi } from "vitest";

const from = vi.fn();

vi.mock("@/features/identity-bridge", () => ({
  supabaseClient: { from: (table: string) => from(table) },
}));

// Same minimal fluent Supabase mock as tenant-directory's data-layer tests
// (see features/tenant-directory/data/tenant-directory-queries.test.ts) --
// every chain method returns the same object, `single()`/`maybeSingle()`
// resolve a terminal promise, and the whole thing is itself thenable for the
// non-`.single()` read (fetchConnectionEdgesForRequest).
function makeBuilder(result: { data: unknown; error: unknown }) {
  const promise = Promise.resolve(result);
  const builder: Record<string, unknown> = {
    select: vi.fn(() => builder),
    insert: vi.fn(() => builder),
    update: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    in: vi.fn(() => builder),
    is: vi.fn(() => builder),
    single: vi.fn(() => promise),
    // biome-ignore lint/suspicious/noThenProperty: intentional thenable test double, mirrors Supabase's real awaitable PostgrestFilterBuilder
    then: promise.then.bind(promise),
    catch: promise.catch.bind(promise),
    finally: promise.finally.bind(promise),
  };
  return builder;
}

const REQUESTER = "11111111-1111-4111-8111-111111111111";
const RECIPIENT = "22222222-2222-4222-8222-222222222222";
const REQUEST_ID = "33333333-3333-4333-8333-333333333333";
const USER_ID = "44444444-4444-4444-8444-444444444444";

const CONNECTION_REQUEST_ROW = {
  id: REQUEST_ID,
  requester_tenant_id: REQUESTER,
  recipient_tenant_id: RECIPIENT,
  origin_type: "vehicle_interest",
  status: "pending",
  vehicle_snapshot_id: null,
  search_request_id: null,
  seeded_by: null,
  requested_by: USER_ID,
  responded_by: null,
  expires_at: "2026-08-03T12:00:00.000Z",
  responded_at: null,
  created_at: "2026-08-01T12:00:00.000Z",
  updated_at: "2026-08-01T12:00:00.000Z",
};

describe("createConnectionRequest", () => {
  beforeEach(() => {
    from.mockReset();
  });

  it("inserts a row restricted to a client-creatable origin_type and returns it", async () => {
    const builder = makeBuilder({ data: CONNECTION_REQUEST_ROW, error: null });
    from.mockReturnValue(builder);

    const { createConnectionRequest } = await import("./connection-requests-queries");
    const row = await createConnectionRequest({
      requesterTenantId: REQUESTER,
      recipientTenantId: RECIPIENT,
      originType: "vehicle_interest",
      requestedBy: USER_ID,
    });

    expect(from).toHaveBeenCalledWith("connection_requests");
    expect(builder.insert).toHaveBeenCalledWith({
      requester_tenant_id: REQUESTER,
      recipient_tenant_id: RECIPIENT,
      origin_type: "vehicle_interest",
      requested_by: USER_ID,
      vehicle_snapshot_id: null,
      search_request_id: null,
    });
    expect(row).toEqual(CONNECTION_REQUEST_ROW);
  });

  it("throws (does not swallow) when the insert is rejected -- e.g. by RLS", async () => {
    from.mockReturnValue(makeBuilder({ data: null, error: new Error("permission denied") }));

    const { createConnectionRequest } = await import("./connection-requests-queries");

    await expect(
      createConnectionRequest({
        requesterTenantId: REQUESTER,
        recipientTenantId: RECIPIENT,
        originType: "search_match",
        requestedBy: USER_ID,
      }),
    ).rejects.toThrow("permission denied");
  });
});

describe("actOnSuggestedRequest", () => {
  beforeEach(() => {
    from.mockReset();
  });

  it("updates status to 'pending' -- the DB trigger computes expires_at, the client never sets it", async () => {
    const builder = makeBuilder({
      data: { ...CONNECTION_REQUEST_ROW, status: "pending" },
      error: null,
    });
    from.mockReturnValue(builder);

    const { actOnSuggestedRequest } = await import("./connection-requests-queries");
    const row = await actOnSuggestedRequest(REQUEST_ID);

    expect(builder.update).toHaveBeenCalledWith({ status: "pending" });
    expect(builder.eq).toHaveBeenCalledWith("id", REQUEST_ID);
    expect(row.status).toBe("pending");
  });
});

describe("acceptConnectionRequest", () => {
  beforeEach(() => {
    from.mockReset();
  });

  it("updates status to 'accepted' with responded_by", async () => {
    const builder = makeBuilder({
      data: { ...CONNECTION_REQUEST_ROW, status: "accepted", responded_by: USER_ID },
      error: null,
    });
    from.mockReturnValue(builder);

    const { acceptConnectionRequest } = await import("./connection-requests-queries");
    const row = await acceptConnectionRequest(REQUEST_ID, USER_ID);

    expect(builder.update).toHaveBeenCalledWith({ status: "accepted", responded_by: USER_ID });
    expect(row.status).toBe("accepted");
  });
});

describe("rejectConnectionRequest", () => {
  beforeEach(() => {
    from.mockReset();
  });

  it("updates status to 'rejected' with responded_by", async () => {
    const builder = makeBuilder({
      data: { ...CONNECTION_REQUEST_ROW, status: "rejected", responded_by: USER_ID },
      error: null,
    });
    from.mockReturnValue(builder);

    const { rejectConnectionRequest } = await import("./connection-requests-queries");
    const row = await rejectConnectionRequest(REQUEST_ID, USER_ID);

    expect(builder.update).toHaveBeenCalledWith({ status: "rejected", responded_by: USER_ID });
    expect(row.status).toBe("rejected");
  });

  it("throws when the update is rejected rather than returning a falsy row", async () => {
    from.mockReturnValue(makeBuilder({ data: null, error: new Error("no such row") }));

    const { rejectConnectionRequest } = await import("./connection-requests-queries");

    await expect(rejectConnectionRequest(REQUEST_ID, USER_ID)).rejects.toThrow("no such row");
  });
});

describe("fetchConnectionEdgesForRequest", () => {
  beforeEach(() => {
    from.mockReset();
  });

  it("returns both reciprocal edges created by the accept trigger", async () => {
    const rows = [
      {
        id: "e1",
        viewer_tenant_id: REQUESTER,
        visible_tenant_id: RECIPIENT,
        connection_request_id: REQUEST_ID,
        created_at: "2026-08-01T12:00:00.000Z",
        revoked_at: null,
      },
      {
        id: "e2",
        viewer_tenant_id: RECIPIENT,
        visible_tenant_id: REQUESTER,
        connection_request_id: REQUEST_ID,
        created_at: "2026-08-01T12:00:00.000Z",
        revoked_at: null,
      },
    ];
    const builder = makeBuilder({ data: rows, error: null });
    from.mockReturnValue(builder);

    const { fetchConnectionEdgesForRequest } = await import("./connection-requests-queries");
    const edges = await fetchConnectionEdgesForRequest(REQUEST_ID);

    expect(from).toHaveBeenCalledWith("connection_edges");
    expect(builder.eq).toHaveBeenCalledWith("connection_request_id", REQUEST_ID);
    expect(edges).toEqual(rows);
  });

  it("returns an empty array (never throws) when a request has no edges yet -- e.g. still pending/rejected", async () => {
    from.mockReturnValue(makeBuilder({ data: [], error: null }));

    const { fetchConnectionEdgesForRequest } = await import("./connection-requests-queries");
    expect(await fetchConnectionEdgesForRequest(REQUEST_ID)).toEqual([]);
  });

  it("returns an empty array on a query error rather than throwing (read path swallows, per tenant-directory convention)", async () => {
    from.mockReturnValue(makeBuilder({ data: null, error: new Error("boom") }));

    const { fetchConnectionEdgesForRequest } = await import("./connection-requests-queries");
    expect(await fetchConnectionEdgesForRequest(REQUEST_ID)).toEqual([]);
  });
});

describe("fetchMyConnectionEdges", () => {
  beforeEach(() => {
    from.mockReset();
  });

  it("reads connection_edges scoped to non-revoked rows and maps to camelCase (RLS scopes to the caller's own tenant)", async () => {
    const rows = [
      { id: "e1", visible_tenant_id: RECIPIENT, connection_request_id: REQUEST_ID },
      { id: "e2", visible_tenant_id: REQUESTER, connection_request_id: REQUEST_ID },
    ];
    const builder = makeBuilder({ data: rows, error: null });
    from.mockReturnValue(builder);

    const { fetchMyConnectionEdges } = await import("./connection-requests-queries");
    const edges = await fetchMyConnectionEdges();

    expect(from).toHaveBeenCalledWith("connection_edges");
    expect(edges).toEqual([
      { id: "e1", visibleTenantId: RECIPIENT, connectionRequestId: REQUEST_ID },
      { id: "e2", visibleTenantId: REQUESTER, connectionRequestId: REQUEST_ID },
    ]);
  });

  it("returns an empty array when there are no active edges yet", async () => {
    from.mockReturnValue(makeBuilder({ data: [], error: null }));

    const { fetchMyConnectionEdges } = await import("./connection-requests-queries");
    expect(await fetchMyConnectionEdges()).toEqual([]);
  });

  it("returns an empty array on a query error rather than throwing", async () => {
    from.mockReturnValue(makeBuilder({ data: null, error: new Error("boom") }));

    const { fetchMyConnectionEdges } = await import("./connection-requests-queries");
    expect(await fetchMyConnectionEdges()).toEqual([]);
  });
});

describe("fetchMyPendingConnectionRequests", () => {
  beforeEach(() => {
    from.mockReset();
  });

  it("reads connection_requests filtered to suggested/pending -- RLS already scopes to the caller's own tenant as requester or recipient", async () => {
    const rows = [
      CONNECTION_REQUEST_ROW,
      { ...CONNECTION_REQUEST_ROW, id: "r2", status: "suggested" },
    ];
    const builder = makeBuilder({ data: rows, error: null });
    from.mockReturnValue(builder);

    const { fetchMyPendingConnectionRequests } = await import("./connection-requests-queries");
    const requests = await fetchMyPendingConnectionRequests();

    expect(from).toHaveBeenCalledWith("connection_requests");
    expect(builder.in).toHaveBeenCalledWith("status", ["suggested", "pending"]);
    expect(requests).toEqual(rows);
  });

  it("returns an empty array when there are no suggested/pending requests", async () => {
    from.mockReturnValue(makeBuilder({ data: [], error: null }));

    const { fetchMyPendingConnectionRequests } = await import("./connection-requests-queries");
    expect(await fetchMyPendingConnectionRequests()).toEqual([]);
  });

  it("returns an empty array on a query error rather than throwing", async () => {
    from.mockReturnValue(makeBuilder({ data: null, error: new Error("boom") }));

    const { fetchMyPendingConnectionRequests } = await import("./connection-requests-queries");
    expect(await fetchMyPendingConnectionRequests()).toEqual([]);
  });
});
