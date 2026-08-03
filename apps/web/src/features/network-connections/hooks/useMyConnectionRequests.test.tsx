import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchMyConnectionRequests = vi.fn();

vi.mock("../data/connection-requests-queries", () => ({
  fetchMyConnectionRequests: () => fetchMyConnectionRequests(),
}));

import { useMyConnectionRequests } from "./useMyConnectionRequests";

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe("useMyConnectionRequests", () => {
  beforeEach(() => {
    fetchMyConnectionRequests.mockReset();
  });

  it("resolves every connection_requests row visible to the caller's own tenant", async () => {
    const requests = [
      { id: "r1", status: "accepted" },
      { id: "r2", status: "pending" },
    ];
    fetchMyConnectionRequests.mockResolvedValue(requests);

    const { result } = renderHook(() => useMyConnectionRequests(), { wrapper });

    await waitFor(() => expect(result.current.data).toEqual(requests));
    expect(fetchMyConnectionRequests).toHaveBeenCalledTimes(1);
  });
});
