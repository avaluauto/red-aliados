import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchReputationEvents = vi.fn();

vi.mock("../data/reputation-events-queries", () => ({
  fetchReputationEvents: (tenantId: string) => fetchReputationEvents(tenantId),
}));

import { useReputationScore } from "./useReputationScore";

const TENANT_ID = "22222222-2222-4222-8222-222222222222";

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe("useReputationScore", () => {
  beforeEach(() => {
    fetchReputationEvents.mockReset();
  });

  it("computes a score from the fetched events", async () => {
    fetchReputationEvents.mockResolvedValue([{ eventType: "accepted", responseTimeSeconds: 0 }]);

    const { result } = renderHook(() => useReputationScore(TENANT_ID), { wrapper });

    await waitFor(() => expect(result.current.score).toBe(100));
    expect(result.current.sampleSize).toBe(1);
    expect(fetchReputationEvents).toHaveBeenCalledWith(TENANT_ID);
  });

  it("resolves to an unrated (null) score when the tenant has no events yet", async () => {
    fetchReputationEvents.mockResolvedValue([]);

    const { result } = renderHook(() => useReputationScore(TENANT_ID), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.score).toBeNull();
    expect(result.current.sampleSize).toBe(0);
    expect(result.current.responseRate).toBeNull();
  });

  it("does not query at all when there is no tenant id yet", () => {
    renderHook(() => useReputationScore(undefined), { wrapper });

    expect(fetchReputationEvents).not.toHaveBeenCalled();
  });

  it("resolves to an unrated score (not a crash) when the query errors/is denied", async () => {
    fetchReputationEvents.mockResolvedValue(null);

    const { result } = renderHook(() => useReputationScore(TENANT_ID), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.score).toBeNull();
    expect(result.current.sampleSize).toBe(0);
    expect(result.current.responseRate).toBeNull();
  });

  it("computes responseRate as the share of terminal events that were NOT expired", async () => {
    fetchReputationEvents.mockResolvedValue([
      { eventType: "accepted", responseTimeSeconds: 0 },
      { eventType: "rejected", responseTimeSeconds: 0 },
      { eventType: "expired", responseTimeSeconds: 0 },
      { eventType: "expired", responseTimeSeconds: 0 },
    ]);

    const { result } = renderHook(() => useReputationScore(TENANT_ID), { wrapper });

    // 2 of 4 terminal events were answered (accepted/rejected) rather than
    // expired -- 50%.
    await waitFor(() => expect(result.current.responseRate).toBe(50));
  });

  it("resolves responseRate to 100 when every terminal event was answered (none expired)", async () => {
    fetchReputationEvents.mockResolvedValue([
      { eventType: "accepted", responseTimeSeconds: 0 },
      { eventType: "rejected", responseTimeSeconds: 0 },
    ]);

    const { result } = renderHook(() => useReputationScore(TENANT_ID), { wrapper });

    await waitFor(() => expect(result.current.responseRate).toBe(100));
  });
});
