// Wires identity-bridge's session hook together with the vehicle-sync data
// adapter behind a single TanStack Query hook, per design.md's hexagonal-lite
// split -- same convention as useOwnTenantVehicles. Unlike that hook, this
// one doesn't need a resolved tenantId to build its query key/args (the
// underlying read has no tenant_id filter at all, see fetchVisibleVehicles's
// own doc comment) -- it's still gated on an authenticated session, though,
// same as every other authenticated-only read in this codebase.
import { useQuery } from "@tanstack/react-query";
import { useSessionClaims } from "@/features/identity-bridge";
import { fetchVisibleVehicles, type VisibleVehicle } from "../data/vehicle-queries";

/** Every vehicle currently visible to the signed-in tenant across the network. */
export function useVisibleVehicles() {
  const { data: session } = useSessionClaims();
  const isAuthenticated = session?.status === "authenticated";

  return useQuery<VisibleVehicle[]>({
    queryKey: ["vehicle-sync", "visible-vehicles"],
    queryFn: fetchVisibleVehicles,
    enabled: isAuthenticated,
  });
}
