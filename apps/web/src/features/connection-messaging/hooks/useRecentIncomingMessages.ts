// Wires fetchRecentIncomingMessages into a TanStack `useQuery`, per
// design.md's hexagonal-lite split (same composition shape as this
// feature's useConnectionMessagesThread). Disabled until a tenantId is
// available -- the caller (routes/index.tsx) derives it from
// useSessionClaims(), same convention useOwnTenantVehicles/
// useOwnSearchRequests already establish.
import { useQuery } from "@tanstack/react-query";
import {
  type ConnectionMessageRow,
  fetchRecentIncomingMessages,
} from "../data/connection-messages-queries";

/** How many recent incoming messages routes/index.tsx's activity feed pulls in. */
export const RECENT_INCOMING_MESSAGES_LIMIT = 5;

export function useRecentIncomingMessages(tenantId: string | undefined) {
  return useQuery<ConnectionMessageRow[]>({
    queryKey: ["connection-messaging", "recent-incoming", tenantId],
    queryFn: () => fetchRecentIncomingMessages(tenantId as string, RECENT_INCOMING_MESSAGES_LIMIT),
    enabled: Boolean(tenantId),
  });
}
