// Pure reputation scoring rules (spec: Score Computation and Expiry Penalty
// -- "Expiry (ignoring a request for 48h) MUST reduce the score more than an
// explicit rejection of equivalent context"). Zero Supabase import on
// purpose (domain layer, hexagonal-lite split -- same pattern
// network-connections/domain/connection-lifecycle.ts and
// tenant-directory/domain/visibility-rules.ts follow).
//
// The REAL event recording is a Postgres trigger
// (supabase/migrations/0008_reputation_events_trigger.sql), which emits
// exactly one `reputation_events` row per terminal connection_requests
// outcome. This module only computes a score from those already-recorded
// events -- it does not, and per spec (Score is read-only) never should,
// write anything back.

export type ReputationEventType = "accepted" | "rejected" | "expired";

export interface ReputationEventInput {
  readonly eventType: ReputationEventType;
  readonly responseTimeSeconds: number;
}

export interface ReputationScoreResult {
  /** null = no terminal events recorded yet ("unrated"), never 0 by omission. */
  readonly score: number | null;
  readonly sampleSize: number;
}

/** Mirrors network-connections' EXPIRY_WINDOW_HOURS (48h), expressed in seconds for this module's own unit. */
export const EXPIRY_WINDOW_SECONDS = 48 * 60 * 60;

/**
 * Per-event-type score anchors, in the [0,100] range. `accepted` starts
 * highest, `rejected` lower but still a deliberate, communicated answer,
 * `expired` is a fixed floor of 0 independent of response time -- silence is
 * unconditionally the worst outcome (spec: "penalizing silence more than
 * explicit rejection"). `ACCEPTED_FLOOR`/`REJECTED_FLOOR` are the minimum
 * each type can decay to as response time approaches the full 48h window --
 * both floors are kept strictly above `expired`'s fixed 0 so the "expiry
 * penalizes more than rejection of equivalent context" requirement holds for
 * ANY response_time_seconds pairing, not only fast ones (see this file's own
 * test: "even for a very fast rejection vs. a very slow expiry").
 */
const BASE_SCORE: Record<"accepted" | "rejected", number> = {
  accepted: 100,
  rejected: 60,
};

const FLOOR_SCORE: Record<"accepted" | "rejected", number> = {
  accepted: 20,
  rejected: 10,
};

function clampElapsedRatio(responseTimeSeconds: number): number {
  const clamped = Math.min(Math.max(responseTimeSeconds, 0), EXPIRY_WINDOW_SECONDS);
  return clamped / EXPIRY_WINDOW_SECONDS;
}

/** Linear interpolation from `start` (elapsedRatio=0) down to `end` (elapsedRatio=1). */
function lerp(start: number, end: number, elapsedRatio: number): number {
  return start + (end - start) * elapsedRatio;
}

function eventScore(event: ReputationEventInput): number {
  if (event.eventType === "expired") {
    // Fixed floor, independent of responseTimeSeconds -- see BASE_SCORE's
    // own comment for why this must never be reachable by rejected/accepted.
    return 0;
  }

  const elapsedRatio = clampElapsedRatio(event.responseTimeSeconds);
  return lerp(BASE_SCORE[event.eventType], FLOOR_SCORE[event.eventType], elapsedRatio);
}

/**
 * Averages the per-event score across every terminal `reputation_events` row
 * for a tenant. Returns `{ score: null, sampleSize: 0 }` for a tenant with no
 * terminal events yet -- "unrated", never a misleading 0.
 */
export function computeReputationScore(
  events: readonly ReputationEventInput[],
): ReputationScoreResult {
  if (events.length === 0) {
    return { score: null, sampleSize: 0 };
  }

  const total = events.reduce((sum, event) => sum + eventScore(event), 0);
  const average = total / events.length;

  return { score: Math.round(average * 100) / 100, sampleSize: events.length };
}
