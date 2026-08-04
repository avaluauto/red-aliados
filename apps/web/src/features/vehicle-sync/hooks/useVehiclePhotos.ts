// Wires identity-bridge's session hook together with the vehicle-sync data
// adapter behind a single TanStack Query hook, per design.md's hexagonal-lite
// split -- same convention as useOwnTenantVehicles/useVisibleVehicles. Unlike
// those two, this hook is disabled on a missing `vehicleSnapshotId` rather
// than a missing session: routes/catalogo.$vehicleId.tsx only knows the id
// once useVisibleVehicles resolves and the vehicle is found in it, so the
// photos query naturally starts disabled until that happens.
import { useQuery } from "@tanstack/react-query";
import { fetchVehiclePhotos, type VehiclePhoto } from "../data/vehicle-queries";

/** A single vehicle snapshot's photos, ordered for gallery display. */
export function useVehiclePhotos(vehicleSnapshotId: string | undefined) {
  return useQuery<VehiclePhoto[]>({
    queryKey: ["vehicle-sync", "vehicle-photos", vehicleSnapshotId],
    queryFn: () => fetchVehiclePhotos(vehicleSnapshotId as string),
    enabled: Boolean(vehicleSnapshotId),
  });
}
