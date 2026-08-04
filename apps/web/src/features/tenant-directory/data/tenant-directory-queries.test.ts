import { beforeEach, describe, expect, it, vi } from "vitest";

const from = vi.fn();

vi.mock("@/features/identity-bridge", () => ({
  supabaseClient: { from: (table: string) => from(table) },
}));

// A minimal fluent mock of Supabase's PostgrestFilterBuilder: every chain
// method returns the same object, and the object is itself thenable/awaitable
// (mirrors the real builder resolving without an explicit terminal call) as
// well as exposing `.maybeSingle()` for the one query that needs it.
function makeBuilder(result: { data: unknown; error: unknown }) {
  const promise = Promise.resolve(result);
  const builder: Record<string, unknown> = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    in: vi.fn(() => builder),
    is: vi.fn(() => builder),
    or: vi.fn(() => builder),
    limit: vi.fn(() => promise),
    maybeSingle: vi.fn(() => promise),
    // biome-ignore lint/suspicious/noThenProperty: intentional thenable test double, mirrors Supabase's real awaitable PostgrestFilterBuilder
    then: promise.then.bind(promise),
    catch: promise.catch.bind(promise),
    finally: promise.finally.bind(promise),
  };
  return builder;
}

const TARGET_TENANT = "22222222-2222-4222-8222-222222222222";

describe("fetchTenantDirectoryEntry", () => {
  beforeEach(() => {
    from.mockReset();
  });

  it("queries vehicle_snapshots_public (never the base tables) and maps the masked row", async () => {
    const builder = makeBuilder({
      data: [
        {
          tenant_id: TARGET_TENANT,
          tenant_name: "Acme Motors",
          contact_phone: "+52 55 1234 5678",
          visibility_tier: "connected",
        },
      ],
      error: null,
    });
    from.mockReturnValue(builder);

    const { fetchTenantDirectoryEntry } = await import("./tenant-directory-queries");
    const entry = await fetchTenantDirectoryEntry(TARGET_TENANT);

    expect(from).toHaveBeenCalledWith("vehicle_snapshots_public");
    expect(builder.eq).toHaveBeenCalledWith("tenant_id", TARGET_TENANT);
    expect(builder.limit).toHaveBeenCalledWith(1);
    expect(entry).toEqual({
      tenantId: TARGET_TENANT,
      tenantName: "Acme Motors",
      contactPhone: "+52 55 1234 5678",
      tier: "connected",
    });
  });

  it("takes the first row when the tenant has more than one vehicle (view is grained per vehicle, not per tenant)", async () => {
    from.mockReturnValue(
      makeBuilder({
        data: [
          {
            tenant_id: TARGET_TENANT,
            tenant_name: "Acme Motors",
            contact_phone: "+52 55 1234 5678",
            visibility_tier: "connected",
          },
          {
            tenant_id: TARGET_TENANT,
            tenant_name: "Acme Motors",
            contact_phone: "+52 55 1234 5678",
            visibility_tier: "connected",
          },
        ],
        error: null,
      }),
    );

    const { fetchTenantDirectoryEntry } = await import("./tenant-directory-queries");
    const entry = await fetchTenantDirectoryEntry(TARGET_TENANT);

    expect(entry).toEqual({
      tenantId: TARGET_TENANT,
      tenantName: "Acme Motors",
      contactPhone: "+52 55 1234 5678",
      tier: "connected",
    });
  });

  it("returns masked null fields as-is for a candidate-tier row", async () => {
    from.mockReturnValue(
      makeBuilder({
        data: [
          {
            tenant_id: TARGET_TENANT,
            tenant_name: null,
            contact_phone: null,
            visibility_tier: "candidate",
          },
        ],
        error: null,
      }),
    );

    const { fetchTenantDirectoryEntry } = await import("./tenant-directory-queries");
    const entry = await fetchTenantDirectoryEntry(TARGET_TENANT);

    expect(entry).toEqual({
      tenantId: TARGET_TENANT,
      tenantName: null,
      contactPhone: null,
      tier: "candidate",
    });
  });

  it("returns null when no row is visible (tier 'none' -- RLS/view filters it out entirely)", async () => {
    from.mockReturnValue(makeBuilder({ data: [], error: null }));

    const { fetchTenantDirectoryEntry } = await import("./tenant-directory-queries");
    const entry = await fetchTenantDirectoryEntry(TARGET_TENANT);

    expect(entry).toBeNull();
  });

  it("returns null on a query error rather than throwing", async () => {
    from.mockReturnValue(makeBuilder({ data: null, error: new Error("boom") }));

    const { fetchTenantDirectoryEntry } = await import("./tenant-directory-queries");
    const entry = await fetchTenantDirectoryEntry(TARGET_TENANT);

    expect(entry).toBeNull();
  });
});

describe("fetchHasNetworkAccess", () => {
  beforeEach(() => {
    from.mockReset();
  });

  it("returns true when a granted, non-revoked access row exists", async () => {
    from.mockReturnValue(makeBuilder({ data: [{ id: "a1" }], error: null }));

    const { fetchHasNetworkAccess } = await import("./tenant-directory-queries");
    expect(await fetchHasNetworkAccess()).toBe(true);
    expect(from).toHaveBeenCalledWith("tenant_users_access");
  });

  it("returns false when no rows are returned", async () => {
    from.mockReturnValue(makeBuilder({ data: [], error: null }));

    const { fetchHasNetworkAccess } = await import("./tenant-directory-queries");
    expect(await fetchHasNetworkAccess()).toBe(false);
  });
});

describe("fetchIsConnected", () => {
  beforeEach(() => {
    from.mockReset();
  });

  it("returns true when an active connection_edges row exists to the target", async () => {
    const builder = makeBuilder({ data: [{ id: "e1" }], error: null });
    from.mockReturnValue(builder);

    const { fetchIsConnected } = await import("./tenant-directory-queries");
    expect(await fetchIsConnected(TARGET_TENANT)).toBe(true);
    expect(from).toHaveBeenCalledWith("connection_edges");
    expect(builder.eq).toHaveBeenCalledWith("visible_tenant_id", TARGET_TENANT);
  });

  it("returns false when no active edge exists", async () => {
    from.mockReturnValue(makeBuilder({ data: [], error: null }));

    const { fetchIsConnected } = await import("./tenant-directory-queries");
    expect(await fetchIsConnected(TARGET_TENANT)).toBe(false);
  });
});

describe("fetchHasCandidateLink", () => {
  beforeEach(() => {
    from.mockReset();
  });

  it("returns true when a suggested/pending request links the two tenants", async () => {
    const builder = makeBuilder({ data: [{ id: "r1" }], error: null });
    from.mockReturnValue(builder);

    const { fetchHasCandidateLink } = await import("./tenant-directory-queries");
    expect(await fetchHasCandidateLink(TARGET_TENANT)).toBe(true);
    expect(from).toHaveBeenCalledWith("connection_requests");
    expect(builder.in).toHaveBeenCalledWith("status", ["suggested", "pending"]);
  });

  it("returns false when there is no linking request at all", async () => {
    from.mockReturnValue(makeBuilder({ data: [], error: null }));

    const { fetchHasCandidateLink } = await import("./tenant-directory-queries");
    expect(await fetchHasCandidateLink(TARGET_TENANT)).toBe(false);
  });
});

describe("fetchReputationSummary", () => {
  beforeEach(() => {
    from.mockReset();
  });

  it("aggregates raw reputation_events counts by event_type", async () => {
    from.mockReturnValue(
      makeBuilder({
        data: [
          { event_type: "accepted", response_time_seconds: 0 },
          { event_type: "accepted", response_time_seconds: 0 },
          { event_type: "rejected", response_time_seconds: 0 },
          { event_type: "expired", response_time_seconds: 172_800 },
        ],
        error: null,
      }),
    );

    const { fetchReputationSummary } = await import("./tenant-directory-queries");
    const summary = await fetchReputationSummary(TARGET_TENANT);

    expect(from).toHaveBeenCalledWith("reputation_events");
    expect(summary).toEqual({
      acceptedCount: 2,
      rejectedCount: 1,
      expiredCount: 1,
      totalCount: 4,
      score: 65, // (100 + 100 + 60 + 0) / 4 -- see partner-reputation/domain's own tests for the per-event formula
    });
  });

  it("returns a zeroed summary (score null, unrated) when there are no events yet", async () => {
    from.mockReturnValue(makeBuilder({ data: [], error: null }));

    const { fetchReputationSummary } = await import("./tenant-directory-queries");
    const summary = await fetchReputationSummary(TARGET_TENANT);

    expect(summary).toEqual({
      acceptedCount: 0,
      rejectedCount: 0,
      expiredCount: 0,
      totalCount: 0,
      score: null,
    });
  });

  it("REQUIREMENT (partner-reputation: Score Computation and Expiry Penalty) -- an otherwise-identical expired outcome scores lower than a rejected one", async () => {
    from.mockReturnValue(
      makeBuilder({
        data: [{ event_type: "expired", response_time_seconds: 172_800 }],
        error: null,
      }),
    );
    const { fetchReputationSummary } = await import("./tenant-directory-queries");
    const expiredSummary = await fetchReputationSummary(TARGET_TENANT);

    from.mockReturnValue(
      makeBuilder({
        data: [{ event_type: "rejected", response_time_seconds: 172_800 }],
        error: null,
      }),
    );
    const rejectedSummary = await fetchReputationSummary(TARGET_TENANT);

    expect(expiredSummary?.score).not.toBeNull();
    expect(rejectedSummary?.score).not.toBeNull();
    expect(expiredSummary?.score as number).toBeLessThan(rejectedSummary?.score as number);
  });

  it("returns null on a query error rather than throwing", async () => {
    from.mockReturnValue(makeBuilder({ data: null, error: new Error("boom") }));

    const { fetchReputationSummary } = await import("./tenant-directory-queries");
    const summary = await fetchReputationSummary(TARGET_TENANT);

    expect(summary).toBeNull();
  });
});
