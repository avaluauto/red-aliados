import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const createConnectionRequest = vi.fn();

vi.mock("../data/connection-requests-queries", () => ({
  createConnectionRequest: (input: unknown) => createConnectionRequest(input),
}));

import { useCreateConnectionRequest } from "./useCreateConnectionRequest";

const REQUESTER = "11111111-1111-4111-8111-111111111111";
const RECIPIENT = "22222222-2222-4222-8222-222222222222";
const USER_ID = "33333333-3333-4333-8333-333333333333";

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe("useCreateConnectionRequest", () => {
  beforeEach(() => {
    createConnectionRequest.mockReset();
  });

  it("calls the data layer with the mutation input and resolves the created row", async () => {
    const createdRow = { id: "r1", status: "pending" };
    createConnectionRequest.mockResolvedValue(createdRow);

    const { result } = renderHook(() => useCreateConnectionRequest(), { wrapper });

    act(() => {
      result.current.mutate({
        requesterTenantId: REQUESTER,
        recipientTenantId: RECIPIENT,
        originType: "vehicle_interest",
        requestedBy: USER_ID,
      });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(createConnectionRequest).toHaveBeenCalledWith({
      requesterTenantId: REQUESTER,
      recipientTenantId: RECIPIENT,
      originType: "vehicle_interest",
      requestedBy: USER_ID,
    });
    expect(result.current.data).toEqual(createdRow);
  });

  it("surfaces a rejected mutation as an error state rather than swallowing it", async () => {
    createConnectionRequest.mockRejectedValue(new Error("permission denied"));

    const { result } = renderHook(() => useCreateConnectionRequest(), { wrapper });

    act(() => {
      result.current.mutate({
        requesterTenantId: REQUESTER,
        recipientTenantId: RECIPIENT,
        originType: "search_match",
        requestedBy: USER_ID,
      });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe("permission denied");
  });
});
