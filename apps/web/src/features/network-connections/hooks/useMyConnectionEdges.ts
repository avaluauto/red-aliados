// Reads the caller's own active connection_edges rows -- routes/red.tsx's
// "Mis conexiones" list, resolved per-tenant via tenant-directory's
// useTenantDirectoryEntry. Same one-hook-per-read convention as this
// feature's other hooks/.
import { useQuery } from "@tanstack/react-query";
import { fetchMyConnectionEdges, type MyConnectionEdge } from "../data/connection-requests-queries";

export function useMyConnectionEdges() {
  return useQuery<MyConnectionEdge[]>({
    queryKey: ["network-connections", "my-edges"],
    queryFn: fetchMyConnectionEdges,
  });
}
