import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchHasNetworkAccess = vi.fn();
const fetchIsConnected = vi.fn();
const fetchHasCandidateLink = vi.fn();

vi.mock("../data/tenant-directory-queries", () => ({
  fetchHasNetworkAccess: () => fetchHasNetworkAccess(),
  fetchIsConnected: (targetTenantId: string) => fetchIsConnected(targetTenantId),
  fetchHasCandidateLink: (targetTenantId: string) => fetchHasCandidateLink(targetTenantId),
}));

import { useConnectionState } from "./useConnectionState";

const TARGET_TENANT = "22222222-2222-4222-8222-222222222222";

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe("useConnectionState", () => {
  beforeEach(() => {
    fetchHasNetworkAccess.mockReset();
    fetchIsConnected.mockReset();
    fetchHasCandidateLink.mockReset();
  });

  it("resolves all three booleans from the data layer", async () => {
    fetchHasNetworkAccess.mockResolvedValue(true);
    fetchIsConnected.mockResolvedValue(false);
    fetchHasCandidateLink.mockResolvedValue(true);

    const { result } = renderHook(() => useConnectionState(TARGET_TENANT), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current).toEqual({
      hasNetworkAccess: true,
      isConnected: false,
      hasCandidateLink: true,
      isLoading: false,
    });
    expect(fetchIsConnected).toHaveBeenCalledWith(TARGET_TENANT);
    expect(fetchHasCandidateLink).toHaveBeenCalledWith(TARGET_TENANT);
  });

  it("defaults every boolean to false while queries are pending", () => {
    fetchHasNetworkAccess.mockReturnValue(new Promise(() => {}));
    fetchIsConnected.mockReturnValue(new Promise(() => {}));
    fetchHasCandidateLink.mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() => useConnectionState(TARGET_TENANT), { wrapper });

    expect(result.current.hasNetworkAccess).toBe(false);
    expect(result.current.isConnected).toBe(false);
    expect(result.current.hasCandidateLink).toBe(false);
    expect(result.current.isLoading).toBe(true);
  });

  it("does not query at all when there is no target tenant yet", () => {
    renderHook(() => useConnectionState(undefined), { wrapper });

    expect(fetchHasNetworkAccess).not.toHaveBeenCalled();
    expect(fetchIsConnected).not.toHaveBeenCalled();
    expect(fetchHasCandidateLink).not.toHaveBeenCalled();
  });
});
