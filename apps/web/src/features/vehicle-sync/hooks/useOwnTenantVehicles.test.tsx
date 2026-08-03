import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchOwnTenantVehicles = vi.fn();
const useSessionClaims = vi.fn();

vi.mock("../data/vehicle-queries", () => ({
  fetchOwnTenantVehicles: (tenantId: string) => fetchOwnTenantVehicles(tenantId),
}));

vi.mock("@/features/identity-bridge", () => ({
  useSessionClaims: () => useSessionClaims(),
}));

import { useOwnTenantVehicles } from "./useOwnTenantVehicles";

const TENANT_ID = "a0000000-0000-4000-8000-000000000001";

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe("useOwnTenantVehicles", () => {
  beforeEach(() => {
    fetchOwnTenantVehicles.mockReset();
    useSessionClaims.mockReset();
  });

  it("fetches the signed-in tenant's own vehicles when authenticated", async () => {
    useSessionClaims.mockReturnValue({
      data: { status: "authenticated", claims: { tenantId: TENANT_ID } },
    });
    const vehicles = [{ id: "v1", make: "Toyota", model: "Corolla" }];
    fetchOwnTenantVehicles.mockResolvedValue(vehicles);

    const { result } = renderHook(() => useOwnTenantVehicles(), { wrapper });

    await waitFor(() => expect(result.current.data).toEqual(vehicles));
    expect(fetchOwnTenantVehicles).toHaveBeenCalledWith(TENANT_ID);
  });

  it("does not query when there is no authenticated session", () => {
    useSessionClaims.mockReturnValue({ data: { status: "unauthenticated" } });

    renderHook(() => useOwnTenantVehicles(), { wrapper });

    expect(fetchOwnTenantVehicles).not.toHaveBeenCalled();
  });
});
