// Three small mutation hooks covering every recipient action on a
// connection_requests row (network-connections: Suggested Status for Seeded
// Requests' "recipient acts on it", 48-Hour Expiry with Double Opt-In's
// accept/reject). Each wraps exactly one data/ function -- same
// one-hook-per-action granularity as tenant-directory's hooks/.
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  acceptConnectionRequest,
  actOnSuggestedRequest,
  type ConnectionRequestRow,
  rejectConnectionRequest,
} from "../data/connection-requests-queries";

export interface RespondToConnectionRequestInput {
  readonly requestId: string;
  readonly respondedBy: string;
}

function useInvalidateNetworkConnections() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ["network-connections"] });
}

/** Promotes a `suggested` request to `pending` (spec: "Recipient acts on a suggestion"). */
export function useActOnSuggestedRequest() {
  const invalidate = useInvalidateNetworkConnections();

  return useMutation<ConnectionRequestRow, Error, string>({
    mutationFn: (requestId) => actOnSuggestedRequest(requestId),
    onSuccess: invalidate,
  });
}

/**
 * Accepts a pending request. Reciprocal `connection_edges` rows are created
 * server-side by the accept trigger (0006) -- this hook only resolves the
 * updated request row; callers that need to show the resulting edges should
 * pair this with `useConnectionEdgesForRequest`.
 */
export function useAcceptConnectionRequest() {
  const invalidate = useInvalidateNetworkConnections();

  return useMutation<ConnectionRequestRow, Error, RespondToConnectionRequestInput>({
    mutationFn: ({ requestId, respondedBy }) => acceptConnectionRequest(requestId, respondedBy),
    onSuccess: invalidate,
  });
}

/** Rejects a pending request. No `connection_edges` rows are created. */
export function useRejectConnectionRequest() {
  const invalidate = useInvalidateNetworkConnections();

  return useMutation<ConnectionRequestRow, Error, RespondToConnectionRequestInput>({
    mutationFn: ({ requestId, respondedBy }) => rejectConnectionRequest(requestId, respondedBy),
    onSuccess: invalidate,
  });
}
