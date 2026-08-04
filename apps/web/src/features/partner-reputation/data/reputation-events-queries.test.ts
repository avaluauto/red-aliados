import { beforeEach, describe, expect, it, vi } from "vitest";

const from = vi.fn();

vi.mock("@/features/identity-bridge", () => ({
  supabaseClient: { from: (table: string) => from(table) },
}));

function makeBuilder(result: { data: unknown; error: unknown }) {
  const promise = Promise.resolve(result);
  const builder: Record<string, unknown> = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    // biome-ignore lint/suspicious/noThenProperty: intentional thenable test double, mirrors Supabase's real awaitable PostgrestFilterBuilder
    then: promise.then.bind(promise),
    catch: promise.catch.bind(promise),
    finally: promise.finally.bind(promise),
  };
  return builder;
}

const TARGET_TENANT = "22222222-2222-4222-8222-222222222222";

describe("fetchReputationEvents", () => {
  beforeEach(() => {
    from.mockReset();
  });

  it("queries reputation_events for the target tenant and maps event_type/response_time_seconds", async () => {
    const builder = makeBuilder({
      data: [
        { event_type: "accepted", response_time_seconds: 120 },
        { event_type: "expired", response_time_seconds: 172800 },
      ],
      error: null,
    });
    from.mockReturnValue(builder);

    const { fetchReputationEvents } = await import("./reputation-events-queries");
    const events = await fetchReputationEvents(TARGET_TENANT);

    expect(from).toHaveBeenCalledWith("reputation_events");
    expect(builder.eq).toHaveBeenCalledWith("tenant_id", TARGET_TENANT);
    expect(events).toEqual([
      { eventType: "accepted", responseTimeSeconds: 120 },
      { eventType: "expired", responseTimeSeconds: 172800 },
    ]);
  });

  it("returns an empty array when the tenant has no terminal events yet", async () => {
    from.mockReturnValue(makeBuilder({ data: [], error: null }));

    const { fetchReputationEvents } = await import("./reputation-events-queries");
    const events = await fetchReputationEvents(TARGET_TENANT);

    expect(events).toEqual([]);
  });

  it("returns null on a query error rather than throwing (RLS denial degrades to unrated, not a crash)", async () => {
    from.mockReturnValue(makeBuilder({ data: null, error: new Error("boom") }));

    const { fetchReputationEvents } = await import("./reputation-events-queries");
    const events = await fetchReputationEvents(TARGET_TENANT);

    expect(events).toBeNull();
  });
});
