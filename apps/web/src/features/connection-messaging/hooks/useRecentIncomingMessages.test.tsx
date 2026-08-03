import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchRecentIncomingMessages = vi.fn();

vi.mock("../data/connection-messages-queries", () => ({
  fetchRecentIncomingMessages: (tenantId: string, limit: number) =>
    fetchRecentIncomingMessages(tenantId, limit),
}));

import {
  RECENT_INCOMING_MESSAGES_LIMIT,
  useRecentIncomingMessages,
} from "./useRecentIncomingMessages";

const TENANT_ID = "a0000000-0000-4000-8000-000000000001";

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe("useRecentIncomingMessages", () => {
  beforeEach(() => {
    fetchRecentIncomingMessages.mockReset();
  });

  it("fetches the tenant's recent incoming messages when a tenantId is given", async () => {
    const messages = [{ id: "m1", body: "hola" }];
    fetchRecentIncomingMessages.mockResolvedValue(messages);

    const { result } = renderHook(() => useRecentIncomingMessages(TENANT_ID), { wrapper });

    await waitFor(() => expect(result.current.data).toEqual(messages));
    expect(fetchRecentIncomingMessages).toHaveBeenCalledWith(
      TENANT_ID,
      RECENT_INCOMING_MESSAGES_LIMIT,
    );
  });

  it("does not query when there is no tenantId", () => {
    renderHook(() => useRecentIncomingMessages(undefined), { wrapper });

    expect(fetchRecentIncomingMessages).not.toHaveBeenCalled();
  });
});
