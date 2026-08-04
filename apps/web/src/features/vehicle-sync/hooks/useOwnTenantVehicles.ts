// Wires identity-bridge's session hook (current tenant) together with the
// vehicle-sync data adapter behind a single TanStack Query hook, per
// design.md's hexagonal-lite split -- mirrors network-authorization's
// useVisibilityTier composing useSessionClaims for the current tenant_id.
import { useQuery } from "@tanstack/react-query";
import { useSessionClaims } from "@/features/identity-bridge";
import { fetchOwnTenantVehicles, type OwnTenantVehicle } from "../data/vehicle-queries";

/** The signed-in tenant's own vehicle inventory. Disabled until a session resolves. */
export function useOwnTenantVehicles() {
  const { data: session } = useSessionClaims();
  const tenantId = session?.status === "authenticated" ? session.claims.tenantId : undefined;

  return useQuery<OwnTenantVehicle[]>({
    queryKey: ["vehicle-sync", "own-tenant-vehicles", tenantId],
    queryFn: () => fetchOwnTenantVehicles(tenantId as string),
    enabled: Boolean(tenantId),
  });
}
