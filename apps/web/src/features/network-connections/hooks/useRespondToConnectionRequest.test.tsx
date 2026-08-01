import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const actOnSuggestedRequest = vi.fn();
const acceptConnectionRequest = vi.fn();
const rejectConnectionRequest = vi.fn();

vi.mock("../data/connection-requests-queries", () => ({
  actOnSuggestedRequest: (requestId: string) => actOnSuggestedRequest(requestId),
  acceptConnectionRequest: (requestId: string, respondedBy: string) =>
    acceptConnectionRequest(requestId, respondedBy),
  rejectConnectionRequest: (requestId: string, respondedBy: string) =>
    rejectConnectionRequest(requestId, respondedBy),
}));

import {
  useAcceptConnectionRequest,
  useActOnSuggestedRequest,
  useRejectConnectionRequest,
} from "./useRespondToConnectionRequest";

const REQUEST_ID = "33333333-3333-4333-8333-333333333333";
const USER_ID = "44444444-4444-4444-8444-444444444444";

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe("useActOnSuggestedRequest", () => {
  beforeEach(() => {
    actOnSuggestedRequest.mockReset();
  });

  it("promotes a suggested request to pending", async () => {
    actOnSuggestedRequest.mockResolvedValue({ id: REQUEST_ID, status: "pending" });

    const { result } = renderHook(() => useActOnSuggestedRequest(), { wrapper });

    act(() => {
      result.current.mutate(REQUEST_ID);
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(actOnSuggestedRequest).toHaveBeenCalledWith(REQUEST_ID);
    expect(result.current.data).toEqual({ id: REQUEST_ID, status: "pending" });
  });
});

describe("useAcceptConnectionRequest", () => {
  beforeEach(() => {
    acceptConnectionRequest.mockReset();
  });

  it("accepts a pending request with the responding user", async () => {
    acceptConnectionRequest.mockResolvedValue({ id: REQUEST_ID, status: "accepted" });

    const { result } = renderHook(() => useAcceptConnectionRequest(), { wrapper });

    act(() => {
      result.current.mutate({ requestId: REQUEST_ID, respondedBy: USER_ID });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(acceptConnectionRequest).toHaveBeenCalledWith(REQUEST_ID, USER_ID);
  });
});

describe("useRejectConnectionRequest", () => {
  beforeEach(() => {
    rejectConnectionRequest.mockReset();
  });

  it("rejects a pending request with the responding user", async () => {
    rejectConnectionRequest.mockResolvedValue({ id: REQUEST_ID, status: "rejected" });

    const { result } = renderHook(() => useRejectConnectionRequest(), { wrapper });

    act(() => {
      result.current.mutate({ requestId: REQUEST_ID, respondedBy: USER_ID });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(rejectConnectionRequest).toHaveBeenCalledWith(REQUEST_ID, USER_ID);
  });

  it("surfaces a rejected mutation as an error state", async () => {
    rejectConnectionRequest.mockRejectedValue(new Error("no such row"));

    const { result } = renderHook(() => useRejectConnectionRequest(), { wrapper });

    act(() => {
      result.current.mutate({ requestId: REQUEST_ID, respondedBy: USER_ID });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe("no such row");
  });
});
