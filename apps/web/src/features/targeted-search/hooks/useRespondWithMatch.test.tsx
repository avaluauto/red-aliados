import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const respondWithMatch = vi.fn();

vi.mock("../data/targeted-search-queries", () => ({
  respondWithMatch: (input: unknown) => respondWithMatch(input),
}));

import { useRespondWithMatch } from "./useRespondWithMatch";

const SEARCH_REQUEST_ID = "55555555-5555-4555-8555-555555555555";
const TENANT_A = "11111111-1111-4111-8111-111111111111";
const TENANT_B = "22222222-2222-4222-8222-222222222222";
const USER_B = "88888888-8888-4888-8888-888888888888";
const VEHICLE_ID = "66666666-6666-4666-8666-666666666666";

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe("useRespondWithMatch", () => {
  beforeEach(() => {
    respondWithMatch.mockReset();
  });

  it("calls the data layer with the mutation input and resolves the created row", async () => {
    const createdRow = { id: "cr1", origin_type: "search_match", status: "pending" };
    respondWithMatch.mockResolvedValue(createdRow);

    const { result } = renderHook(() => useRespondWithMatch(), { wrapper });

    act(() => {
      result.current.mutate({
        searchRequestId: SEARCH_REQUEST_ID,
        matchOwnerTenantId: TENANT_B,
        originalRequesterTenantId: TENANT_A,
        matchOwnerUserId: USER_B,
        vehicleSnapshotId: VEHICLE_ID,
      });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(respondWithMatch).toHaveBeenCalledWith({
      searchRequestId: SEARCH_REQUEST_ID,
      matchOwnerTenantId: TENANT_B,
      originalRequesterTenantId: TENANT_A,
      matchOwnerUserId: USER_B,
      vehicleSnapshotId: VEHICLE_ID,
    });
    expect(result.current.data).toEqual(createdRow);
  });

  it("surfaces a rejected mutation as an error state", async () => {
    respondWithMatch.mockRejectedValue(new Error("permission denied"));

    const { result } = renderHook(() => useRespondWithMatch(), { wrapper });

    act(() => {
      result.current.mutate({
        searchRequestId: SEARCH_REQUEST_ID,
        matchOwnerTenantId: TENANT_B,
        originalRequesterTenantId: TENANT_A,
        matchOwnerUserId: USER_B,
        vehicleSnapshotId: VEHICLE_ID,
      });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe("permission denied");
  });
});
