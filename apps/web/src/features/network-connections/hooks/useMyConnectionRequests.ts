// Reads every connection_requests row visible to the caller's own tenant,
// any status, either direction -- routes/mensajes.tsx's thread list. Same
// one-hook-per-read convention as this feature's other hooks/ (see
// useMyConnectionEdges.ts).
import { useQuery } from "@tanstack/react-query";
import {
  type ConnectionRequestRow,
  fetchMyConnectionRequests,
} from "../data/connection-requests-queries";

export function useMyConnectionRequests() {
  return useQuery<ConnectionRequestRow[]>({
    queryKey: ["network-connections", "my-requests"],
    queryFn: fetchMyConnectionRequests,
  });
}
