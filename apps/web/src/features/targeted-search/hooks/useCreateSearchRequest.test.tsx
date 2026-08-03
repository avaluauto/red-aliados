import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const createSearchRequest = vi.fn();

vi.mock("../data/targeted-search-queries", () => ({
  createSearchRequest: (input: unknown) => createSearchRequest(input),
}));

import { useCreateSearchRequest } from "./useCreateSearchRequest";

const TENANT_A = "11111111-1111-4111-8111-111111111111";
const USER_A = "44444444-4444-4444-8444-444444444444";

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe("useCreateSearchRequest", () => {
  beforeEach(() => {
    createSearchRequest.mockReset();
  });

  it("calls the data layer with the mutation input and resolves the created row", async () => {
    const createdRow = { id: "sr1", tenant_id: TENANT_A, requested_by: USER_A, status: "open" };
    createSearchRequest.mockResolvedValue(createdRow);

    const { result } = renderHook(() => useCreateSearchRequest(), { wrapper });

    act(() => {
      result.current.mutate({
        tenantId: TENANT_A,
        requestedBy: USER_A,
        criteria: { make: "Toyota" },
      });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(createSearchRequest).toHaveBeenCalledWith({
      tenantId: TENANT_A,
      requestedBy: USER_A,
      criteria: { make: "Toyota" },
    });
    expect(result.current.data).toEqual(createdRow);
  });

  it("surfaces a rejected mutation as an error state rather than swallowing it", async () => {
    createSearchRequest.mockRejectedValue(new Error("permission denied"));

    const { result } = renderHook(() => useCreateSearchRequest(), { wrapper });

    act(() => {
      result.current.mutate({ tenantId: TENANT_A, requestedBy: USER_A, criteria: {} });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe("permission denied");
  });
});
