// Wires the reputation_events read + the pure scoring domain function
// together into one TanStack Query hook, per design.md's hexagonal-lite
// split (same composition pattern useConnectionEdgesForRequest establishes
// for network-connections).
import { useQuery } from "@tanstack/react-query";
import { fetchReputationEvents } from "../data/reputation-events-queries";
import {
  computeReputationScore,
  type ReputationEventInput,
  type ReputationScoreResult,
} from "../domain/reputation-score";

export interface UseReputationScoreResult extends ReputationScoreResult {
  readonly isLoading: boolean;
  /**
   * Fraction (0-100) of this tenant's terminal `reputation_events` that were
   * NOT `expired` -- i.e. the tenant actually gave an answer (accepted or
   * rejected) rather than letting the request time out. `null` under the
   * same "unrated" convention as `score`: no terminal events yet, or the
   * underlying read errored/was denied.
   */
  readonly responseRate: number | null;
}

const UNRATED: ReputationScoreResult = { score: null, sampleSize: 0 };

/**
 * Sibling to `computeReputationScore` -- kept in this hook file rather than
 * domain/reputation-score.ts on purpose: it's a real computation over the
 * same already-fetched `reputation_events` rows, but it isn't part of the
 * spec's "Score Computation" surface (computeReputationScore's own tests
 * assert an exact `{ score, sampleSize }` shape), so it doesn't belong
 * inside that pure scoring function.
 */
function computeResponseRate(events: readonly ReputationEventInput[]): number | null {
  if (events.length === 0) {
    return null;
  }
  const answered = events.filter((event) => event.eventType !== "expired").length;
  return Math.round((answered / events.length) * 100);
}

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
  const responseRate = query.data ? computeResponseRate(query.data) : null;

  return { ...result, responseRate, isLoading: query.isPending };
}
