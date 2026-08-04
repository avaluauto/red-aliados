// Reads the reciprocal connection_edges rows for a given request -- lets the
// UI confirm "connected both ways" after an accept without re-deriving the
// pairing logic (see domain/connection-lifecycle.ts's reciprocalEdgeTenantPairs).
import { useQuery } from "@tanstack/react-query";
import {
  type ConnectionEdgeRow,
  fetchConnectionEdgesForRequest,
} from "../data/connection-requests-queries";

export function useConnectionEdgesForRequest(requestId: string | undefined) {
  return useQuery<ConnectionEdgeRow[]>({
    queryKey: ["network-connections", "edges", requestId],
    queryFn: () => fetchConnectionEdgesForRequest(requestId as string),
    enabled: Boolean(requestId),
  });
}
