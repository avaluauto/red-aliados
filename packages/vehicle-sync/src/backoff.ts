// Retry backoff for `sync_event_log` rows in status 'failed', drained by
// reconcile-outbox (design.md — "sync_event_log idempotency": backoff
// 1m/5m/25m/2h/12h, max 5 -> dead).
//
// Interpretation decision (design.md's phrasing is genuinely ambiguous
// between "5 total attempts" and "5 retries then dead" — documented here
// rather than silently picked): all 5 listed backoff values are treated as
// meaningful, one per retry attempt. `attempts` is the count of attempts
// already made (the attempt that just failed). Attempts 1-5 each schedule
// the next retry using BACKOFF_STEPS_MS[attempts - 1]; only once a 6th
// attempt has also failed (i.e. all 5 backoff steps, including the final
// 12h wait, have been exhausted) does the row go `dead`. This is the
// interpretation that gives every one of the 5 specified numbers an actual
// effect — the alternative reading ("dead as soon as attempts === 5") would
// make the 12h entry dead code, which reads as a spec inconsistency rather
// than intent.

const BACKOFF_STEPS_MS = [
  1 * 60_000, // 1m
  5 * 60_000, // 5m
  25 * 60_000, // 25m
  2 * 60 * 60_000, // 2h
  12 * 60 * 60_000, // 12h
] as const;

export const MAX_RETRY_ATTEMPTS = BACKOFF_STEPS_MS.length;

export type BackoffResult = { status: "retry"; nextAttemptAt: Date } | { status: "dead" };

/**
 * @param attempts Number of attempts already made, including the one that
 *   just failed (1-indexed).
 * @param now Defaults to `new Date()`.
 */
export function computeBackoff(attempts: number, now: Date = new Date()): BackoffResult {
  if (attempts > MAX_RETRY_ATTEMPTS) {
    return { status: "dead" };
  }

  const delayMs = BACKOFF_STEPS_MS[attempts - 1];
  if (delayMs === undefined) {
    // attempts <= 0 is not a valid failed-attempt count; treat defensively
    // as the first step rather than throwing mid reconcile-outbox run.
    return { status: "retry", nextAttemptAt: new Date(now.getTime() + BACKOFF_STEPS_MS[0]) };
  }

  return { status: "retry", nextAttemptAt: new Date(now.getTime() + delayMs) };
}
