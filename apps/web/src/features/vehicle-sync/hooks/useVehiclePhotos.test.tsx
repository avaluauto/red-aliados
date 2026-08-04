import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchVehiclePhotos = vi.fn();

vi.mock("../data/vehicle-queries", () => ({
  fetchVehiclePhotos: (vehicleSnapshotId: string) => fetchVehiclePhotos(vehicleSnapshotId),
}));

import { useVehiclePhotos } from "./useVehiclePhotos";

const VEHICLE_ID = "d0000000-0000-4000-8000-000000000004";

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe("useVehiclePhotos", () => {
  beforeEach(() => {
    fetchVehiclePhotos.mockReset();
  });

  it("fetches a vehicle's photos when a vehicleSnapshotId is given", async () => {
    const photos = [{ id: "p1", url: "https://example.com/p1.jpg", position: 0 }];
    fetchVehiclePhotos.mockResolvedValue(photos);

    const { result } = renderHook(() => useVehiclePhotos(VEHICLE_ID), { wrapper });

    await waitFor(() => expect(result.current.data).toEqual(photos));
    expect(fetchVehiclePhotos).toHaveBeenCalledWith(VEHICLE_ID);
  });

  it("does not query when there is no vehicleSnapshotId", () => {
    renderHook(() => useVehiclePhotos(undefined), { wrapper });

    expect(fetchVehiclePhotos).not.toHaveBeenCalled();
  });
});
