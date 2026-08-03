import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchVisibleVehicles = vi.fn();
const useSessionClaims = vi.fn();

vi.mock("../data/vehicle-queries", () => ({
  fetchVisibleVehicles: () => fetchVisibleVehicles(),
}));

vi.mock("@/features/identity-bridge", () => ({
  useSessionClaims: () => useSessionClaims(),
}));

import { useVisibleVehicles } from "./useVisibleVehicles";

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe("useVisibleVehicles", () => {
  beforeEach(() => {
    fetchVisibleVehicles.mockReset();
    useSessionClaims.mockReset();
  });

  it("fetches every visible vehicle when authenticated, with no tenant filter", async () => {
    useSessionClaims.mockReturnValue({
      data: { status: "authenticated", claims: { tenantId: "t1" } },
    });
    const vehicles = [{ id: "v1", tenantId: "t1", make: "Toyota", model: "Corolla" }];
    fetchVisibleVehicles.mockResolvedValue(vehicles);

    const { result } = renderHook(() => useVisibleVehicles(), { wrapper });

    await waitFor(() => expect(result.current.data).toEqual(vehicles));
    expect(fetchVisibleVehicles).toHaveBeenCalledWith();
  });

  it("does not query when there is no authenticated session", () => {
    useSessionClaims.mockReturnValue({ data: { status: "unauthenticated" } });

    renderHook(() => useVisibleVehicles(), { wrapper });

    expect(fetchVisibleVehicles).not.toHaveBeenCalled();
  });
});
