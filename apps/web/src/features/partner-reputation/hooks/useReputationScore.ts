// Wires the reputation_events read + the pure scoring domain function
// together into one TanStack Query hook, per design.md's hexagonal-lite
// split (same composition pattern useConnectionEdgesForRequest establishes
// for network-connections).
import { useQuery } from "@tanstack/react-query";
import { fetchReputationEvents } from "../data/reputation-events-queries";
import { computeReputationScore, type ReputationScoreResult } from "../domain/reputation-score";

export interface UseReputationScoreResult extends ReputationScoreResult {
  readonly isLoading: boolean;
}

const UNRATED: ReputationScoreResult = { score: null, sampleSize: 0 };

/**
 * A tenant's computed reputation score. Resolves to `{ score: null,
 * sampleSize: 0 }` ("unrated") both while there are genuinely zero terminal
 * events yet AND when the underlying read is denied/errors -- the caller
 * cannot distinguish "no history" from "not visible to me" from this hook
 * alone, which is intentional: RLS (0003's select_reputation_events policy)
 * is the real visibility gate, this hook never leaks whether a denial vs. an
 * empty history occurred.
 */
export function useReputationScore(tenantId: string | undefined): UseReputationScoreResult {
  const query = useQuery({
    queryKey: ["partner-reputation", "events", tenantId],
    queryFn: () => fetchReputationEvents(tenantId as string),
    enabled: Boolean(tenantId),
  });

  const result = query.data ? computeReputationScore(query.data) : UNRATED;

  return { ...result, isLoading: query.isPending };
}
