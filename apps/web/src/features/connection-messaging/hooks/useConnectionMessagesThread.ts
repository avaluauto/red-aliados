// Wires the party-check + messages read + Realtime subscription together,
// per design.md's hexagonal-lite split (hooks/ composes data/, components
// never call data/ directly -- same convention every other feature's hooks/
// establishes).
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import {
  type ConnectionMessageRow,
  fetchConnectionMessages,
  fetchConnectionRequestParty,
  subscribeToConnectionMessages,
} from "../data/connection-messages-queries";
import { isMessagingContactRevealed } from "../domain/contact-reveal";

export interface ConnectionMessagesThreadResult {
  /** True only once `fetchConnectionRequestParty` confirms the caller's own tenant is requester/recipient. */
  readonly isParticipant: boolean;
  readonly contactRevealed: boolean;
  readonly messages: readonly ConnectionMessageRow[];
  readonly isLoading: boolean;
}

const messagesQueryKey = (requestId: string) =>
  ["connection-messaging", "messages", requestId] as const;

/**
 * A single connection_request's message thread. Task 8.2's exact
 * requirement -- "the client only ever subscribes to requests it's actually
 * part of" -- is enforced here, not in the data layer: `fetchConnectionMessages`
 * and `subscribeToConnectionMessages` are only ever called once the party
 * query above has resolved a non-null row. RLS
 * (`select_own_thread_messages`/`select_own_connection_requests`, 0003)
 * remains the real enforcement point; this is the client-side guard that
 * avoids even attempting the read/subscription for a foreign request.
 */
export function useConnectionMessagesThread(
  requestId: string | undefined,
): ConnectionMessagesThreadResult {
  const queryClient = useQueryClient();

  const partyQuery = useQuery({
    queryKey: ["connection-messaging", "party", requestId],
    queryFn: () => fetchConnectionRequestParty(requestId as string),
    enabled: Boolean(requestId),
  });

  const isParticipant = Boolean(partyQuery.data);

  const messagesQuery = useQuery({
    queryKey: requestId
      ? messagesQueryKey(requestId)
      : (["connection-messaging", "messages", "none"] as const),
    queryFn: () => fetchConnectionMessages(requestId as string),
    enabled: Boolean(requestId) && isParticipant,
  });

  useEffect(() => {
    if (!requestId || !isParticipant) {
      return;
    }

    const unsubscribe = subscribeToConnectionMessages(requestId, (message) => {
      queryClient.setQueryData<ConnectionMessageRow[]>(messagesQueryKey(requestId), (current) => {
        if (current?.some((existing) => existing.id === message.id)) {
          return current;
        }
        return [...(current ?? []), message];
      });
    });

    return unsubscribe;
  }, [requestId, isParticipant, queryClient]);

  return {
    isParticipant,
    contactRevealed: isMessagingContactRevealed(partyQuery.data?.status ?? "pending"),
    messages: messagesQuery.data ?? [],
    isLoading: partyQuery.isPending || (isParticipant && messagesQuery.isPending),
  };
}
