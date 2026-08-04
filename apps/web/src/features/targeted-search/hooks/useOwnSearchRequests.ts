// Wires fetchOwnSearchRequests into a TanStack `useQuery`, per design.md's
// hexagonal-lite split (same composition shape as vehicle-sync's
// useOwnTenantVehicles). Disabled until a tenantId is available -- the
// caller (routes/solicitudes.tsx) derives it from useSessionClaims().
import { useQuery } from "@tanstack/react-query";
import { fetchOwnSearchRequests, type SearchRequestRow } from "../data/targeted-search-queries";

export function useOwnSearchRequests(tenantId: string | undefined) {
  return useQuery<SearchRequestRow[]>({
    queryKey: ["targeted-search", "own-requests", tenantId],
    queryFn: () => fetchOwnSearchRequests(tenantId as string),
    enabled: Boolean(tenantId),
  });
}
