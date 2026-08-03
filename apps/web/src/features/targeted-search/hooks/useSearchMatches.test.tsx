import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchOwnInventoryVehicles = vi.fn();
const fetchFanOutMatches = vi.fn();

vi.mock("../data/targeted-search-queries", () => ({
  fetchOwnInventoryVehicles: (tenantId: string) => fetchOwnInventoryVehicles(tenantId),
  fetchFanOutMatches: (searchRequestId: string) => fetchFanOutMatches(searchRequestId),
}));

import { useSearchMatches } from "./useSearchMatches";

const TENANT_A = "11111111-1111-4111-8111-111111111111";
const TENANT_B = "22222222-2222-4222-8222-222222222222";
const SEARCH_REQUEST_ID = "55555555-5555-4555-8555-555555555555";
const VEHICLE_OWN = "66666666-6666-4666-8666-666666666666";
const VEHICLE_NETWORK = "77777777-7777-4777-8777-777777777777";

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe("useSearchMatches", () => {
  beforeEach(() => {
    fetchOwnInventoryVehicles.mockReset();
    fetchFanOutMatches.mockReset();
  });

  // Own-Inventory-First Search: own inventory is searched unconditionally;
  // fan-out is never even queried until the caller says it is enabled
  // (mirrors task 8.2's "the client only ever subscribes to requests it's
  // actually part of" -- here, fan-out is never even queried before opt-in).
  it("only fetches own-inventory vehicles when fan-out is not yet enabled", async () => {
    fetchOwnInventoryVehicles.mockResolvedValue([
      { id: VEHICLE_OWN, tenant_id: TENANT_A, make: "Toyota", model: "Corolla", year: 2020 },
    ]);

    const { result } = renderHook(
      () =>
        useSearchMatches({
          tenantId: TENANT_A,
          searchRequestId: SEARCH_REQUEST_ID,
          fanOutEnabled: false,
        }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(fetchFanOutMatches).not.toHaveBeenCalled();
    expect(result.current.matches).toHaveLength(1);
    expect(result.current.matches[0]).toMatchObject({ source: "own_inventory", make: "Toyota" });
  });

  // Own-Inventory-First Search + Opt-In Fan-Out to Connected Tenants Only:
  // once fan-out is enabled, network matches (search_match-origin
  // connection_requests rows) are combined with own-inventory ones, but
  // own-inventory ALWAYS precedes network in the returned order.
  it("orders own-inventory matches before network matches once fan-out is enabled", async () => {
    fetchOwnInventoryVehicles.mockResolvedValue([
      { id: VEHICLE_OWN, tenant_id: TENANT_A, make: "Toyota", model: "Corolla", year: 2020 },
    ]);
    fetchFanOutMatches.mockResolvedValue([
      {
        id: "cr1",
        requester_tenant_id: TENANT_B,
        recipient_tenant_id: TENANT_A,
        origin_type: "search_match",
        status: "pending",
        search_request_id: SEARCH_REQUEST_ID,
        vehicle_snapshot_id: VEHICLE_NETWORK,
      },
    ]);

    const { result } = renderHook(
      () =>
        useSearchMatches({
          tenantId: TENANT_A,
          searchRequestId: SEARCH_REQUEST_ID,
          fanOutEnabled: true,
        }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.matches).toHaveLength(2));

    expect(fetchFanOutMatches).toHaveBeenCalledWith(SEARCH_REQUEST_ID);
    expect(result.current.matches.map((m) => m.source)).toEqual(["own_inventory", "network"]);
    expect(result.current.matches[1]).toMatchObject({
      source: "network",
      vehicleSnapshotId: VEHICLE_NETWORK,
      matchOwnerTenantId: TENANT_B,
      connectionRequestId: "cr1",
    });
  });
});
