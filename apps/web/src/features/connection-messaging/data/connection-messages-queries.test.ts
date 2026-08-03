import { beforeEach, describe, expect, it, vi } from "vitest";

const from = vi.fn();
const channelOn = vi.fn();
const channelSubscribe = vi.fn();
const channel = vi.fn();
const removeChannel = vi.fn();

vi.mock("@/features/identity-bridge", () => ({
  supabaseClient: {
    from: (table: string) => from(table),
    channel: (topic: string) => channel(topic),
    removeChannel: (ch: unknown) => removeChannel(ch),
  },
}));

// Same minimal fluent Supabase mock as network-connections/tenant-directory's
// data-layer tests -- every chain method returns the same object, terminal
// methods resolve a promise, and the whole thing is itself thenable for a
// non-`.single()`/`.maybeSingle()` read.
function makeBuilder(result: { data: unknown; error: unknown }) {
  const promise = Promise.resolve(result);
  const builder: Record<string, unknown> = {
    select: vi.fn(() => builder),
    insert: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    neq: vi.fn(() => builder),
    order: vi.fn(() => builder),
    limit: vi.fn(() => promise),
    single: vi.fn(() => promise),
    maybeSingle: vi.fn(() => promise),
    // biome-ignore lint/suspicious/noThenProperty: intentional thenable test double, mirrors Supabase's real awaitable PostgrestFilterBuilder
    then: promise.then.bind(promise),
    catch: promise.catch.bind(promise),
    finally: promise.finally.bind(promise),
  };
  return builder;
}

const REQUEST_ID = "33333333-3333-4333-8333-333333333333";
const REQUESTER = "11111111-1111-4111-8111-111111111111";
const RECIPIENT = "22222222-2222-4222-8222-222222222222";
const SENDER_USER = "44444444-4444-4444-8444-444444444444";

beforeEach(() => {
  from.mockReset();
  channel.mockReset();
  channelOn.mockReset();
  channelSubscribe.mockReset();
  removeChannel.mockReset();
});

describe("fetchConnectionRequestParty", () => {
  it("returns the mapped party row when RLS allows it (caller is requester or recipient)", async () => {
    const builder = makeBuilder({
      data: {
        id: REQUEST_ID,
        requester_tenant_id: REQUESTER,
        recipient_tenant_id: RECIPIENT,
        status: "pending",
      },
      error: null,
    });
    from.mockReturnValue(builder);

    const { fetchConnectionRequestParty } = await import("./connection-messages-queries");
    const party = await fetchConnectionRequestParty(REQUEST_ID);

    expect(from).toHaveBeenCalledWith("connection_requests");
    expect(builder.eq).toHaveBeenCalledWith("id", REQUEST_ID);
    expect(party).toEqual({
      id: REQUEST_ID,
      requesterTenantId: REQUESTER,
      recipientTenantId: RECIPIENT,
      status: "pending",
    });
  });

  it("returns null when RLS filters the row out (caller is not a party) -- select_own_connection_requests", async () => {
    from.mockReturnValue(makeBuilder({ data: null, error: null }));

    const { fetchConnectionRequestParty } = await import("./connection-messages-queries");
    expect(await fetchConnectionRequestParty(REQUEST_ID)).toBeNull();
  });

  it("returns null (never throws) on a query error", async () => {
    from.mockReturnValue(makeBuilder({ data: null, error: new Error("boom") }));

    const { fetchConnectionRequestParty } = await import("./connection-messages-queries");
    expect(await fetchConnectionRequestParty(REQUEST_ID)).toBeNull();
  });
});

describe("fetchConnectionMessages", () => {
  it("returns messages ordered oldest first", async () => {
    const rows = [
      {
        id: "m1",
        connection_request_id: REQUEST_ID,
        sender_tenant_id: REQUESTER,
        sender_user_id: SENDER_USER,
        body: "hello",
        created_at: "2026-08-01T12:00:00.000Z",
      },
    ];
    const builder = makeBuilder({ data: rows, error: null });
    from.mockReturnValue(builder);

    const { fetchConnectionMessages } = await import("./connection-messages-queries");
    const messages = await fetchConnectionMessages(REQUEST_ID);

    expect(from).toHaveBeenCalledWith("connection_messages");
    expect(builder.eq).toHaveBeenCalledWith("connection_request_id", REQUEST_ID);
    expect(builder.order).toHaveBeenCalledWith("created_at", { ascending: true });
    expect(messages).toEqual(rows);
  });

  it("returns an empty array (never throws) on a query error", async () => {
    from.mockReturnValue(makeBuilder({ data: null, error: new Error("boom") }));

    const { fetchConnectionMessages } = await import("./connection-messages-queries");
    expect(await fetchConnectionMessages(REQUEST_ID)).toEqual([]);
  });
});

describe("fetchRecentIncomingMessages", () => {
  it("excludes the caller's own tenant, orders newest first, and limits to N", async () => {
    const rows = [
      {
        id: "m2",
        connection_request_id: REQUEST_ID,
        sender_tenant_id: RECIPIENT,
        sender_user_id: SENDER_USER,
        body: "hola",
        created_at: "2026-08-02T12:00:00.000Z",
      },
    ];
    const builder = makeBuilder({ data: rows, error: null });
    from.mockReturnValue(builder);

    const { fetchRecentIncomingMessages } = await import("./connection-messages-queries");
    const messages = await fetchRecentIncomingMessages(REQUESTER, 5);

    expect(from).toHaveBeenCalledWith("connection_messages");
    expect(builder.neq).toHaveBeenCalledWith("sender_tenant_id", REQUESTER);
    expect(builder.order).toHaveBeenCalledWith("created_at", { ascending: false });
    expect(builder.limit).toHaveBeenCalledWith(5);
    expect(messages).toEqual(rows);
  });

  it("returns an empty array (never throws) on a query error", async () => {
    from.mockReturnValue(makeBuilder({ data: null, error: new Error("boom") }));

    const { fetchRecentIncomingMessages } = await import("./connection-messages-queries");
    expect(await fetchRecentIncomingMessages(REQUESTER, 5)).toEqual([]);
  });
});

describe("sendConnectionMessage", () => {
  it("inserts a message and returns the created row", async () => {
    const row = {
      id: "m2",
      connection_request_id: REQUEST_ID,
      sender_tenant_id: REQUESTER,
      sender_user_id: SENDER_USER,
      body: "hi there",
      created_at: "2026-08-01T12:05:00.000Z",
    };
    const builder = makeBuilder({ data: row, error: null });
    from.mockReturnValue(builder);

    const { sendConnectionMessage } = await import("./connection-messages-queries");
    const result = await sendConnectionMessage({
      connectionRequestId: REQUEST_ID,
      senderTenantId: REQUESTER,
      senderUserId: SENDER_USER,
      body: "hi there",
    });

    expect(builder.insert).toHaveBeenCalledWith({
      connection_request_id: REQUEST_ID,
      sender_tenant_id: REQUESTER,
      sender_user_id: SENDER_USER,
      body: "hi there",
    });
    expect(result).toEqual(row);
  });

  it("throws (does not swallow) when the insert is rejected -- e.g. by RLS", async () => {
    from.mockReturnValue(makeBuilder({ data: null, error: new Error("permission denied") }));

    const { sendConnectionMessage } = await import("./connection-messages-queries");
    await expect(
      sendConnectionMessage({
        connectionRequestId: REQUEST_ID,
        senderTenantId: REQUESTER,
        senderUserId: SENDER_USER,
        body: "hi there",
      }),
    ).rejects.toThrow("permission denied");
  });
});

describe("subscribeToConnectionMessages", () => {
  it("opens a Realtime channel scoped to the given connection_request_id and returns an unsubscribe function", () => {
    const fakeChannel = { on: channelOn, subscribe: channelSubscribe };
    channelOn.mockReturnValue(fakeChannel);
    channelSubscribe.mockReturnValue(fakeChannel);
    channel.mockReturnValue(fakeChannel);

    return import("./connection-messages-queries").then(({ subscribeToConnectionMessages }) => {
      const onInsert = vi.fn();
      const unsubscribe = subscribeToConnectionMessages(REQUEST_ID, onInsert);

      expect(channel).toHaveBeenCalledWith(`connection_messages:${REQUEST_ID}`);
      expect(channelOn).toHaveBeenCalledWith(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "connection_messages",
          filter: `connection_request_id=eq.${REQUEST_ID}`,
        },
        expect.any(Function),
      );
      expect(channelSubscribe).toHaveBeenCalledTimes(1);

      unsubscribe();
      expect(removeChannel).toHaveBeenCalledWith(fakeChannel);
    });
  });

  it("forwards a Realtime INSERT payload's new row to the onInsert callback", async () => {
    const fakeChannel = { on: channelOn, subscribe: channelSubscribe };
    channelOn.mockReturnValue(fakeChannel);
    channelSubscribe.mockReturnValue(fakeChannel);
    channel.mockReturnValue(fakeChannel);

    const { subscribeToConnectionMessages } = await import("./connection-messages-queries");
    const onInsert = vi.fn();
    subscribeToConnectionMessages(REQUEST_ID, onInsert);

    const handler = channelOn.mock.calls[0]?.[2] as (payload: { new: unknown }) => void;
    const newRow = { id: "m3", body: "realtime hi" };
    handler({ new: newRow });

    expect(onInsert).toHaveBeenCalledWith(newRow);
  });
});
