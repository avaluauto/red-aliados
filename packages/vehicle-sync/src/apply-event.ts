import type { VehicleSyncEvent } from "@red-aliados/contracts/zod";
import { computeBackoff } from "./backoff";
import type { SyncStore, VehicleSnapshotRow } from "./store";

const SOURCE = "v2-outbox";

export type ApplyToVehicleSnapshotResult = { status: "applied" } | { status: "skipped_stale" };

/**
 * Seq-gated upsert of a single validated event into `vehicle_snapshots` (+
 * `tenants` + `vehicle_snapshot_photos`). Mirrors design.md's data-flow
 * diagram's right-hand branch (post dedupe-insert): "seq > last? -- no -->
 * skipped_stale; yes --> upsert vehicle_snapshots --> applied".
 *
 * Does NOT touch `sync_event_log` -- callers (applyNewEvent below, and
 * reconcile-outbox's retry-drain path) own recording the outcome there,
 * since the two callers have different existing-row semantics (insert vs.
 * update).
 */
export async function applyToVehicleSnapshot(
  event: VehicleSyncEvent,
  store: SyncStore,
): Promise<ApplyToVehicleSnapshotResult> {
  const current = await store.getVehicleSnapshot(event.source_vehicle_id);
  const currentSeq = current?.lastSourceSeq ?? 0;

  if (event.source_seq <= currentSeq) {
    return { status: "skipped_stale" };
  }

  if (event.tenant_name) {
    await store.upsertTenant({ id: event.tenant_id, name: event.tenant_name });
  }

  const row: VehicleSnapshotRow = {
    id: event.source_vehicle_id,
    tenantId: event.tenant_id,
    make: event.make,
    model: event.model,
    year: event.year ?? null,
    allyPrice: event.ally_price ?? null,
    minPrice: event.min_price ?? null,
    status: event.status,
    lastSourceSeq: event.source_seq,
  };
  await store.upsertVehicleSnapshot(row);

  if (event.photos) {
    await store.replaceVehicleSnapshotPhotos(
      event.source_vehicle_id,
      event.photos.map((photo) => ({ url: photo.url, position: photo.position })),
    );
  }

  return { status: "applied" };
}

export type ApplyNewEventResult =
  | { outcome: "applied"; eventLogId: string }
  | { outcome: "duplicate" }
  | { outcome: "skipped_stale"; eventLogId: string }
  | { outcome: "failed"; eventLogId: string; error: string };

/**
 * Full ingestion of a brand-new (not-yet-logged) event: insert-first into
 * `sync_event_log` (on-conflict-do-nothing dedupe), then seq-gate + upsert.
 * Shared by both entry points that discover events this package has never
 * seen before: `ingest-vehicle-event` (webhook push) and
 * `reconcile-outbox`'s gap-scan (V2 outbox pull) -- both produce the same
 * `VehicleSyncEvent` shape, so both go through this one function.
 */
export async function applyNewEvent(
  event: VehicleSyncEvent,
  store: SyncStore,
): Promise<ApplyNewEventResult> {
  const inserted = await store.insertEventLog({
    source: SOURCE,
    eventId: event.source_event_id,
    aggregateType: "vehicle",
    aggregateId: event.source_vehicle_id,
    sourceSeq: event.source_seq,
    status: "received",
    attempts: 0,
    nextAttemptAt: null,
    payload: event,
    error: null,
  });

  if (!inserted) {
    return { outcome: "duplicate" };
  }

  try {
    const result = await applyToVehicleSnapshot(event, store);
    await store.updateEventLog(inserted.id, { status: result.status });
    return { outcome: result.status, eventLogId: inserted.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const backoff = computeBackoff(1);
    await store.updateEventLog(inserted.id, {
      status: "failed",
      attempts: 1,
      nextAttemptAt: backoff.status === "retry" ? backoff.nextAttemptAt : null,
      error: message,
    });
    return { outcome: "failed", eventLogId: inserted.id, error: message };
  }
}
