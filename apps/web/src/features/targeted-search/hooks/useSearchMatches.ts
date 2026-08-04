// Composes own-inventory + fan-out reads into one ordered match list
// (targeted-search spec: Own-Inventory-First Search, Opt-In Fan-Out to
// Connected Tenants Only). Own inventory is always searched; fan-out is
// never even queried until the caller says it is enabled (mirrors
// connection-messaging's useConnectionMessagesThread: never attempt a read
// the caller has not earned the right to make yet).
import { useQuery } from "@tanstack/react-query";
import { fetchFanOutMatches, fetchOwnInventoryVehicles } from "../data/targeted-search-queries";
import { orderMatchesOwnInventoryFirst, type SearchMatchLike } from "../domain/search-matching";

export interface SearchMatch extends SearchMatchLike {
  readonly id: string;
  readonly vehicleSnapshotId: string;
  readonly make: string;
  readonly model: string;
  readonly year: number | null;
  /** The tenant that owns the matching vehicle. */
  readonly matchOwnerTenantId: string;
  /** Only set for `source: 'network'` -- the search_match connection_requests row id (see useRespondWithMatch/useProceedOnMatch). */
  readonly connectionRequestId?: string;
}

export interface UseSearchMatchesInput {
  readonly tenantId: string | undefined;
  readonly searchRequestId: string | undefined;
  readonly fanOutEnabled: boolean;
}

export interface UseSearchMatchesResult {
  readonly matches: SearchMatch[];
  readonly isLoading: boolean;
}

export function useSearchMatches({
  tenantId,
  searchRequestId,
  fanOutEnabled,
}: UseSearchMatchesInput): UseSearchMatchesResult {
  const ownQuery = useQuery({
    queryKey: ["targeted-search", "own-inventory", tenantId],
    queryFn: () => fetchOwnInventoryVehicles(tenantId as string),
    enabled: Boolean(tenantId),
  });

  const fanOutQuery = useQuery({
    queryKey: ["targeted-search", "matches", searchRequestId],
    queryFn: () => fetchFanOutMatches(searchRequestId as string),
    enabled: Boolean(searchRequestId) && fanOutEnabled,
  });

  const ownMatches: SearchMatch[] = (ownQuery.data ?? []).map((vehicle) => ({
    id: vehicle.id,
    source: "own_inventory" as const,
    vehicleSnapshotId: vehicle.id,
    make: vehicle.make,
    model: vehicle.model,
    year: vehicle.year,
    matchOwnerTenantId: vehicle.tenant_id,
  }));

  const networkMatches: SearchMatch[] = (fanOutQuery.data ?? [])
    .filter((row) => row.vehicle_snapshot_id)
    .map((row) => ({
      id: row.id,
      source: "network" as const,
      vehicleSnapshotId: row.vehicle_snapshot_id as string,
      // The fan-out read (fetchFanOutMatches) does not join vehicle_snapshots
      // -- make/model for a network match are resolved by the caller from
      // vehicle_snapshots_public (same view tenant-directory reads through)
      // once it fetches the matched vehicle by id; this hook only wires the
      // connection_requests row itself, staying additive rather than
      // duplicating tenant-directory's own vehicle-fetching logic.
      make: "",
      model: "",
      year: null,
      matchOwnerTenantId: row.requester_tenant_id,
      connectionRequestId: row.id,
    }));

  return {
    matches: orderMatchesOwnInventoryFirst([...ownMatches, ...networkMatches]),
    isLoading:
      (Boolean(tenantId) && ownQuery.isPending) ||
      (Boolean(searchRequestId) && fanOutEnabled && fanOutQuery.isPending),
  };
}
