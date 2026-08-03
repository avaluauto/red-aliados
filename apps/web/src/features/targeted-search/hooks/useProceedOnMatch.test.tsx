import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const proceedOnMatch = vi.fn();

vi.mock("../data/targeted-search-queries", () => ({
  proceedOnMatch: (input: unknown) => proceedOnMatch(input),
}));

import { useProceedOnMatch } from "./useProceedOnMatch";

const SEARCH_REQUEST_ID = "55555555-5555-4555-8555-555555555555";
const TENANT_B = "22222222-2222-4222-8222-222222222222";
const USER_A = "44444444-4444-4444-8444-444444444444";
const VEHICLE_ID = "66666666-6666-4666-8666-666666666666";

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe("useProceedOnMatch", () => {
  beforeEach(() => {
    proceedOnMatch.mockReset();
  });

  // No Auto-Share; Explicit Proceed Fires Opportunity Event: this mutation
  // IS the only trigger in this whole module for the search_opportunities_out
  // event -- it must never be called implicitly by any query.
  it("calls the data layer only when explicitly mutated, and resolves the created opportunity row", async () => {
    const createdRow = {
      id: "opp1",
      search_request_id: SEARCH_REQUEST_ID,
      vehicle_snapshot_id: VEHICLE_ID,
      matched_tenant_id: TENANT_B,
      proceeded_by: USER_A,
    };
    proceedOnMatch.mockResolvedValue(createdRow);

    const { result } = renderHook(() => useProceedOnMatch(), { wrapper });

    expect(proceedOnMatch).not.toHaveBeenCalled();

    act(() => {
      result.current.mutate({
        searchRequestId: SEARCH_REQUEST_ID,
        vehicleSnapshotId: VEHICLE_ID,
        matchedTenantId: TENANT_B,
        proceededBy: USER_A,
      });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(proceedOnMatch).toHaveBeenCalledWith({
      searchRequestId: SEARCH_REQUEST_ID,
      vehicleSnapshotId: VEHICLE_ID,
      matchedTenantId: TENANT_B,
      proceededBy: USER_A,
    });
    expect(result.current.data).toEqual(createdRow);
  });

  it("surfaces a rejected mutation as an error state", async () => {
    proceedOnMatch.mockRejectedValue(new Error("permission denied"));

    const { result } = renderHook(() => useProceedOnMatch(), { wrapper });

    act(() => {
      result.current.mutate({
        searchRequestId: SEARCH_REQUEST_ID,
        vehicleSnapshotId: VEHICLE_ID,
        matchedTenantId: TENANT_B,
        proceededBy: USER_A,
      });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe("permission denied");
  });
});
