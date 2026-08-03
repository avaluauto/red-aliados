import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchConnectionRequestParty = vi.fn();
const fetchConnectionMessages = vi.fn();
const subscribeToConnectionMessages = vi.fn();

vi.mock("../data/connection-messages-queries", () => ({
  fetchConnectionRequestParty: (id: string) => fetchConnectionRequestParty(id),
  fetchConnectionMessages: (id: string) => fetchConnectionMessages(id),
  subscribeToConnectionMessages: (id: string, onInsert: unknown) =>
    subscribeToConnectionMessages(id, onInsert),
}));

import { useConnectionMessagesThread } from "./useConnectionMessagesThread";

const REQUEST_ID = "33333333-3333-4333-8333-333333333333";
const REQUESTER = "11111111-1111-4111-8111-111111111111";
const RECIPIENT = "22222222-2222-4222-8222-222222222222";

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe("useConnectionMessagesThread", () => {
  beforeEach(() => {
    fetchConnectionRequestParty.mockReset();
    fetchConnectionMessages.mockReset();
    subscribeToConnectionMessages.mockReset();
    subscribeToConnectionMessages.mockReturnValue(vi.fn());
  });

  it("resolves isParticipant=false and never fetches messages or subscribes when the caller is not a party to the request", async () => {
    fetchConnectionRequestParty.mockResolvedValue(null);

    const { result } = renderHook(() => useConnectionMessagesThread(REQUEST_ID), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.isParticipant).toBe(false);
    expect(result.current.messages).toEqual([]);
    expect(fetchConnectionMessages).not.toHaveBeenCalled();
    // task 8.2's exact requirement: the client only ever subscribes to
    // requests it's actually part of.
    expect(subscribeToConnectionMessages).not.toHaveBeenCalled();
  });

  it("fetches messages and subscribes once the party check confirms the caller is requester/recipient", async () => {
    fetchConnectionRequestParty.mockResolvedValue({
      id: REQUEST_ID,
      requesterTenantId: REQUESTER,
      recipientTenantId: RECIPIENT,
      status: "pending",
    });
    fetchConnectionMessages.mockResolvedValue([]);

    const { result } = renderHook(() => useConnectionMessagesThread(REQUEST_ID), { wrapper });

    await waitFor(() => expect(result.current.isParticipant).toBe(true));
    await waitFor(() => expect(fetchConnectionMessages).toHaveBeenCalledWith(REQUEST_ID));
    await waitFor(() => expect(subscribeToConnectionMessages).toHaveBeenCalledTimes(1));
    expect(subscribeToConnectionMessages).toHaveBeenCalledWith(REQUEST_ID, expect.any(Function));
  });

  it("gates contactRevealed off the request's own status -- hidden while pending", async () => {
    fetchConnectionRequestParty.mockResolvedValue({
      id: REQUEST_ID,
      requesterTenantId: REQUESTER,
      recipientTenantId: RECIPIENT,
      status: "pending",
    });
    fetchConnectionMessages.mockResolvedValue([]);

    const { result } = renderHook(() => useConnectionMessagesThread(REQUEST_ID), { wrapper });

    await waitFor(() => expect(result.current.isParticipant).toBe(true));
    expect(result.current.contactRevealed).toBe(false);
  });

  it("gates contactRevealed off the request's own status -- revealed once accepted", async () => {
    fetchConnectionRequestParty.mockResolvedValue({
      id: REQUEST_ID,
      requesterTenantId: REQUESTER,
      recipientTenantId: RECIPIENT,
      status: "accepted",
    });
    fetchConnectionMessages.mockResolvedValue([]);

    const { result } = renderHook(() => useConnectionMessagesThread(REQUEST_ID), { wrapper });

    await waitFor(() => expect(result.current.isParticipant).toBe(true));
    expect(result.current.contactRevealed).toBe(true);
  });

  it("appends a Realtime INSERT payload to the messages list, deduped by id", async () => {
    fetchConnectionRequestParty.mockResolvedValue({
      id: REQUEST_ID,
      requesterTenantId: REQUESTER,
      recipientTenantId: RECIPIENT,
      status: "pending",
    });
    fetchConnectionMessages.mockResolvedValue([
      {
        id: "m1",
        connection_request_id: REQUEST_ID,
        sender_tenant_id: REQUESTER,
        sender_user_id: "u1",
        body: "first",
        created_at: "2026-08-01T12:00:00.000Z",
      },
    ]);

    const { result } = renderHook(() => useConnectionMessagesThread(REQUEST_ID), { wrapper });

    await waitFor(() => expect(subscribeToConnectionMessages).toHaveBeenCalledTimes(1));
    const onInsert = subscribeToConnectionMessages.mock.calls[0]?.[1] as (message: unknown) => void;

    onInsert({
      id: "m2",
      connection_request_id: REQUEST_ID,
      sender_tenant_id: RECIPIENT,
      sender_user_id: "u2",
      body: "second",
      created_at: "2026-08-01T12:01:00.000Z",
    });

    await waitFor(() => expect(result.current.messages).toHaveLength(2));
    expect(result.current.messages.map((m) => m.id)).toEqual(["m1", "m2"]);

    // Re-delivering the same id (e.g. own optimistic send + Realtime echo) must not duplicate.
    onInsert({
      id: "m2",
      connection_request_id: REQUEST_ID,
      sender_tenant_id: RECIPIENT,
      sender_user_id: "u2",
      body: "second",
      created_at: "2026-08-01T12:01:00.000Z",
    });
    await waitFor(() => expect(result.current.messages).toHaveLength(2));
  });

  it("does not query or subscribe at all when there is no requestId yet", () => {
    renderHook(() => useConnectionMessagesThread(undefined), { wrapper });

    expect(fetchConnectionRequestParty).not.toHaveBeenCalled();
    expect(fetchConnectionMessages).not.toHaveBeenCalled();
    expect(subscribeToConnectionMessages).not.toHaveBeenCalled();
  });
});
