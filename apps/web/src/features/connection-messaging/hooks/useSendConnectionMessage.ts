// Wires the send-message data function into a TanStack `useMutation`, per
// design.md's hexagonal-lite split (same composition pattern
// useCreateConnectionRequest establishes for network-connections).
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  type ConnectionMessageRow,
  type SendConnectionMessageInput,
  sendConnectionMessage,
} from "../data/connection-messages-queries";

/**
 * Sends a message in an existing thread. On success, appends the created row
 * to the thread's own cached message list (deduped by id) -- this is a
 * no-op once the Realtime INSERT event for the same row also arrives
 * (`useConnectionMessagesThread`'s own dedupe-by-id merge handles either
 * order), so the sender sees their own message immediately without waiting
 * on the round trip through Realtime.
 */
export function useSendConnectionMessage() {
  const queryClient = useQueryClient();

  return useMutation<ConnectionMessageRow, Error, SendConnectionMessageInput>({
    mutationFn: sendConnectionMessage,
    onSuccess: (message) => {
      queryClient.setQueryData<ConnectionMessageRow[]>(
        ["connection-messaging", "messages", message.connection_request_id],
        (current) => {
          if (current?.some((existing) => existing.id === message.id)) {
            return current;
          }
          return [...(current ?? []), message];
        },
      );
    },
  });
}
