import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchConnectionEdgesForRequest = vi.fn();

vi.mock("../data/connection-requests-queries", () => ({
  fetchConnectionEdgesForRequest: (requestId: string) => fetchConnectionEdgesForRequest(requestId),
}));

import { useConnectionEdgesForRequest } from "./useConnectionEdgesForRequest";

const REQUEST_ID = "33333333-3333-4333-8333-333333333333";

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe("useConnectionEdgesForRequest", () => {
  beforeEach(() => {
    fetchConnectionEdgesForRequest.mockReset();
  });

  it("resolves the edges for a given request id", async () => {
    const edges = [
      { id: "e1", viewer_tenant_id: "a", visible_tenant_id: "b" },
      { id: "e2", viewer_tenant_id: "b", visible_tenant_id: "a" },
    ];
    fetchConnectionEdgesForRequest.mockResolvedValue(edges);

    const { result } = renderHook(() => useConnectionEdgesForRequest(REQUEST_ID), { wrapper });

    await waitFor(() => expect(result.current.data).toEqual(edges));
    expect(fetchConnectionEdgesForRequest).toHaveBeenCalledWith(REQUEST_ID);
  });

  it("does not query at all when there is no request id yet", () => {
    renderHook(() => useConnectionEdgesForRequest(undefined), { wrapper });

    expect(fetchConnectionEdgesForRequest).not.toHaveBeenCalled();
  });
});
