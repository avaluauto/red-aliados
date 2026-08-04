import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchMyPendingConnectionRequests = vi.fn();

vi.mock("../data/connection-requests-queries", () => ({
  fetchMyPendingConnectionRequests: () => fetchMyPendingConnectionRequests(),
}));

import { useMyPendingConnectionRequests } from "./useMyPendingConnectionRequests";

const TENANT_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_TENANT_ID = "22222222-2222-4222-8222-222222222222";

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe("useMyPendingConnectionRequests", () => {
  beforeEach(() => {
    fetchMyPendingConnectionRequests.mockReset();
  });

  it("filters the fetched suggested/pending rows down to the ones INBOUND for the caller's tenant", async () => {
    const inbound = {
      id: "r1",
      requester_tenant_id: OTHER_TENANT_ID,
      recipient_tenant_id: TENANT_ID,
    };
    const outbound = {
      id: "r2",
      requester_tenant_id: TENANT_ID,
      recipient_tenant_id: OTHER_TENANT_ID,
    };
    fetchMyPendingConnectionRequests.mockResolvedValue([inbound, outbound]);

    const { result } = renderHook(() => useMyPendingConnectionRequests(TENANT_ID), { wrapper });

    await waitFor(() => expect(result.current.data).toEqual([inbound]));
  });

  it("does not query at all when there is no tenant id yet", () => {
    renderHook(() => useMyPendingConnectionRequests(undefined), { wrapper });

    expect(fetchMyPendingConnectionRequests).not.toHaveBeenCalled();
  });
});
