import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchOwnSearchRequests = vi.fn();

vi.mock("../data/targeted-search-queries", () => ({
  fetchOwnSearchRequests: (tenantId: string) => fetchOwnSearchRequests(tenantId),
}));

import { useOwnSearchRequests } from "./useOwnSearchRequests";

const TENANT_ID = "a0000000-0000-4000-8000-000000000001";

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe("useOwnSearchRequests", () => {
  beforeEach(() => {
    fetchOwnSearchRequests.mockReset();
  });

  it("fetches the tenant's own search requests when a tenantId is given", async () => {
    const rows = [{ id: "r1", tenant_id: TENANT_ID, criteria: { make: "Toyota" } }];
    fetchOwnSearchRequests.mockResolvedValue(rows);

    const { result } = renderHook(() => useOwnSearchRequests(TENANT_ID), { wrapper });

    await waitFor(() => expect(result.current.data).toEqual(rows));
    expect(fetchOwnSearchRequests).toHaveBeenCalledWith(TENANT_ID);
  });

  it("does not query when tenantId is undefined", () => {
    renderHook(() => useOwnSearchRequests(undefined), { wrapper });

    expect(fetchOwnSearchRequests).not.toHaveBeenCalled();
  });
});
