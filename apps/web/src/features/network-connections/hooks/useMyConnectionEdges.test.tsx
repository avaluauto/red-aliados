import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchMyConnectionEdges = vi.fn();

vi.mock("../data/connection-requests-queries", () => ({
  fetchMyConnectionEdges: () => fetchMyConnectionEdges(),
}));

import { useMyConnectionEdges } from "./useMyConnectionEdges";

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe("useMyConnectionEdges", () => {
  beforeEach(() => {
    fetchMyConnectionEdges.mockReset();
  });

  it("resolves the caller's own active connection edges", async () => {
    const edges = [
      { id: "e1", visibleTenantId: "a", connectionRequestId: "r1" },
      { id: "e2", visibleTenantId: "b", connectionRequestId: "r2" },
    ];
    fetchMyConnectionEdges.mockResolvedValue(edges);

    const { result } = renderHook(() => useMyConnectionEdges(), { wrapper });

    await waitFor(() => expect(result.current.data).toEqual(edges));
    expect(fetchMyConnectionEdges).toHaveBeenCalledTimes(1);
  });
});
