// Reads the caller's own INBOUND suggested/pending connection_requests --
// routes/red.tsx's "Solicitudes pendientes" list. fetchMyPendingConnectionRequests
// returns every suggested/pending row RLS lets the caller see, in either
// direction (requester or recipient); this hook filters down to inbound-only
// (recipient_tenant_id === tenantId) client-side, since those are the only
// ones actionable via useActOnSuggestedRequest/useAcceptConnectionRequest/
// useRejectConnectionRequest -- an outbound request the caller's tenant sent
// has nothing to accept/reject here.
import { useQuery } from "@tanstack/react-query";
import {
  type ConnectionRequestRow,
  fetchMyPendingConnectionRequests,
} from "../data/connection-requests-queries";

export function useMyPendingConnectionRequests(tenantId: string | undefined) {
  return useQuery<ConnectionRequestRow[]>({
    queryKey: ["network-connections", "my-pending-requests", tenantId],
    queryFn: async () => {
      const rows = await fetchMyPendingConnectionRequests();
      return rows.filter((row) => row.recipient_tenant_id === tenantId);
    },
    enabled: Boolean(tenantId),
  });
}
