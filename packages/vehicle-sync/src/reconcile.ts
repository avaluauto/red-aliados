import type { VehicleSyncEvent } from "@red-aliados/contracts/zod";
import { applyNewEvent, applyToVehicleSnapshot } from "./apply-event";
import { computeBackoff } from "./backoff";
import type { SyncStore } from "./store";

/**
 * Assumed V2 outbox "gap scan" contract (there is no live V2 endpoint to
 * call in this sandbox -- see spec/vehicle-sync and design.md's
 * "Reconciliation Backstop" / gap-scan reconcile line; this shape is a
 * documented assumption, not something verified against a real V2 project):
 *
 *   GET {V2_BASE_URL}/outbox?aggregate_type=vehicle&since=<seq>
 *   -> 200 OK, JSON array of events ascending by source_seq, each shaped
 *      exactly like the ingest-vehicle-event webhook payload
 *      (VehicleSyncEvent, packages/contracts/src/zod/vehicle-sync.ts).
 *   `since` is EXCLUSIVE -- only events with source_seq > since are
 *   returned, matching `store.getMaxAppliedSeq()`'s "highest already-applied
 *   seq" semantics one-to-one.
 *
 * Injected as a plain async function so it can be stubbed in tests (task
 * 4.3: "mock/stub this external call in tests -- there is no real V2
 * endpoint to hit") and swapped for a real `fetch(...)` call by the Deno
 * entrypoint (supabase/functions/reconcile-outbox/index.ts).
 */
export type FetchOutboxSince = (sinceSeq: number) => Promise<VehicleSyncEvent[]>;

export interface ReconcileDeps {
  store: SyncStore;
  fetchOutboxSince: FetchOutboxSince;
  now?: Date;
}

export interface RetryOutcome {
  eventLogId: string;
  result: "applied" | "skipped_stale" | "failed" | "dead";
}

export interface GapScanOutcome {
  applied: number;
  skippedStale: number;
  duplicate: number;
  failed: number;
}

export interface ReconcileResult {
  retried: RetryOutcome[];
  gapScan: GapScanOutcome;
}

/**
 * `supabase/functions/reconcile-outbox`'s testable core, run on the
 * pg_cron /15min schedule (supabase/migrations/0005_pg_cron_reconcile.sql).
 * Does BOTH halves of design.md's reconcile line in one pass:
 *   1. Retry-drain: due `failed` rows in `sync_event_log` (backoff.ts).
 *   2. Gap-scan: pull anything V2 has past our max applied seq, in case a
 *      webhook delivery was dropped entirely (never even reached
 *      `sync_event_log` as 'failed' -- the webhook path alone is never
 *      trusted as the sole source of truth, per spec: "Reconciliation
 *      Backstop").
 */
export async function runReconcileOutbox(deps: ReconcileDeps): Promise<ReconcileResult> {
  const now = deps.now ?? new Date();

  const retried: RetryOutcome[] = [];
  const due = await deps.store.listDueRetries(now);
  for (const row of due) {
    const event = row.payload as VehicleSyncEvent;
    try {
      const applied = await applyToVehicleSnapshot(event, deps.store);
      await deps.store.updateEventLog(row.id, { status: applied.status });
      retried.push({ eventLogId: row.id, result: applied.status });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const nextAttempts = row.attempts + 1;
      const backoff = computeBackoff(nextAttempts, now);
      if (backoff.status === "dead") {
        await deps.store.updateEventLog(row.id, {
          status: "dead",
          attempts: nextAttempts,
          error: message,
        });
        retried.push({ eventLogId: row.id, result: "dead" });
      } else {
        await deps.store.updateEventLog(row.id, {
          status: "failed",
          attempts: nextAttempts,
          nextAttemptAt: backoff.nextAttemptAt,
          error: message,
        });
        retried.push({ eventLogId: row.id, result: "failed" });
      }
    }
  }

  const maxAppliedSeq = await deps.store.getMaxAppliedSeq();
  const gapEvents = await deps.fetchOutboxSince(maxAppliedSeq);
  const gapScan: GapScanOutcome = { applied: 0, skippedStale: 0, duplicate: 0, failed: 0 };
  for (const event of gapEvents) {
    const result = await applyNewEvent(event, deps.store);
    gapScan[result.outcome === "skipped_stale" ? "skippedStale" : result.outcome] += 1;
  }

  return { retried, gapScan };
}
