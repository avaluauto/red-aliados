// Opt-In Fan-Out to Connected Tenants Only (targeted-search spec). This hook
// is the ONLY place in the feature that turns a "who might have this
// vehicle" candidate list into an actual fan-out: it always re-reads the
// caller's currently-connected tenants (fetchConnectedTenantIds --
// connection_edges, the same table/RLS pattern network-connections/
// tenant-directory already use) and narrows the candidate list through
// domain's filterConnectedFanOutTargets before ever calling optInToFanOut.
// A stale or attacker-supplied candidate list can never smuggle an
// unconnected tenant through -- same invariant this codebase's very first
// architecture correction established ("never platform-wide").
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  fetchConnectedTenantIds,
  type OptInToFanOutResult,
  optInToFanOut,
} from "../data/targeted-search-queries";
import { filterConnectedFanOutTargets } from "../domain/search-matching";

export interface OptInFanOutInput {
  readonly searchRequestId: string;
  /** Tenants the caller believes might have a matching vehicle -- narrowed to connected-only before any row is written. */
  readonly candidateTenantIds: readonly string[];
}

export function useOptInFanOut() {
  const queryClient = useQueryClient();

  return useMutation<OptInToFanOutResult, Error, OptInFanOutInput>({
    mutationFn: async ({ searchRequestId, candidateTenantIds }) => {
      const connectedTenantIds = await fetchConnectedTenantIds();
      const targets = filterConnectedFanOutTargets(candidateTenantIds, connectedTenantIds);
      return optInToFanOut(searchRequestId, targets);
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["targeted-search", "matches", variables.searchRequestId],
      });
    },
  });
}
