import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchConnectedTenantIds = vi.fn();
const optInToFanOut = vi.fn();

vi.mock("../data/targeted-search-queries", () => ({
  fetchConnectedTenantIds: () => fetchConnectedTenantIds(),
  optInToFanOut: (searchRequestId: string, targets: string[]) =>
    optInToFanOut(searchRequestId, targets),
}));

import { useOptInFanOut } from "./useOptInFanOut";

const SEARCH_REQUEST_ID = "55555555-5555-4555-8555-555555555555";
const TENANT_B = "22222222-2222-4222-8222-222222222222";
const TENANT_C = "33333333-3333-4333-8333-333333333333";

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe("useOptInFanOut", () => {
  beforeEach(() => {
    fetchConnectedTenantIds.mockReset();
    optInToFanOut.mockReset();
  });

  // Opt-In Fan-Out to Connected Tenants Only (targeted-search spec): even
  // when the caller supplies a broader candidate list (e.g. from
  // tenant-directory), this hook only ever opts in tenants the FRESH
  // connected-tenant read actually confirms -- never platform-wide, never
  // an unconnected candidate that merely "looked" like a match.
  it("narrows the candidate list to currently-connected tenants before opting in", async () => {
    fetchConnectedTenantIds.mockResolvedValue([TENANT_B]);
    optInToFanOut.mockResolvedValue({
      searchRequest: { id: SEARCH_REQUEST_ID, opted_in_fan_out: true },
      targets: [{ id: "t1", search_request_id: SEARCH_REQUEST_ID, target_tenant_id: TENANT_B }],
    });

    const { result } = renderHook(() => useOptInFanOut(), { wrapper });

    act(() => {
      result.current.mutate({
        searchRequestId: SEARCH_REQUEST_ID,
        candidateTenantIds: [TENANT_B, TENANT_C],
      });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(fetchConnectedTenantIds).toHaveBeenCalledTimes(1);
    expect(optInToFanOut).toHaveBeenCalledWith(SEARCH_REQUEST_ID, [TENANT_B]);
    expect(result.current.data?.targets).toHaveLength(1);
  });

  it("opts in with an empty target list when no candidate is currently connected", async () => {
    fetchConnectedTenantIds.mockResolvedValue([]);
    optInToFanOut.mockResolvedValue({
      searchRequest: { id: SEARCH_REQUEST_ID, opted_in_fan_out: true },
      targets: [],
    });

    const { result } = renderHook(() => useOptInFanOut(), { wrapper });

    act(() => {
      result.current.mutate({
        searchRequestId: SEARCH_REQUEST_ID,
        candidateTenantIds: [TENANT_C],
      });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(optInToFanOut).toHaveBeenCalledWith(SEARCH_REQUEST_ID, []);
  });

  it("surfaces a rejected mutation as an error state", async () => {
    fetchConnectedTenantIds.mockResolvedValue([TENANT_B]);
    optInToFanOut.mockRejectedValue(new Error("permission denied"));

    const { result } = renderHook(() => useOptInFanOut(), { wrapper });

    act(() => {
      result.current.mutate({
        searchRequestId: SEARCH_REQUEST_ID,
        candidateTenantIds: [TENANT_B],
      });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe("permission denied");
  });
});
