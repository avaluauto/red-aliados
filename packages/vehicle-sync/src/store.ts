// Storage contract this package's logic is written against. Kept deliberately
// small and Postgres-shaped (not Supabase-client-shaped) so:
//   1. Tests can use a plain in-memory fake (src/testing/in-memory-store.ts)
//      implementing the exact same semantics real Postgres would, instead of
//      mocking away behavior with `vi.fn()` stand-ins.
//   2. The real implementation (Deno-only, lives under
//      supabase/functions/_shared, NOT covered by `pnpm -r typecheck` since
//      supabase/functions is intentionally outside the pnpm workspace --
//      Deno edge functions use their own toolchain) stays a thin adapter.
//
// NOT executed against a real Supabase/Postgres instance in this sandbox (no
// Supabase CLI / Docker / Deno runtime available) -- see apply-progress for
// what WAS verified (this package's Vitest suite, run for real) vs. what
// remains to be verified once a live project exists (real Postgres-backed
// SyncStore + the Deno entrypoints).

export type SyncEventStatus = "received" | "applied" | "failed" | "skipped_stale" | "dead";

export interface SyncEventLogRow {
  id: string;
  source: string;
  eventId: string;
  aggregateType: "vehicle" | "tenant";
  aggregateId: string;
  sourceSeq: number;
  status: SyncEventStatus;
  attempts: number;
  nextAttemptAt: Date | null;
  payload: unknown;
  error: string | null;
}

export type NewSyncEventLogRow = Omit<SyncEventLogRow, "id">;

export interface VehicleSnapshotRow {
  id: string; // == source_vehicle_id, V2-assigned, not locally generated
  tenantId: string;
  make: string;
  model: string;
  year: number | null;
  allyPrice: number | null;
  minPrice: number | null;
  status: string;
  lastSourceSeq: number;
}

export interface VehicleSnapshotPhotoInput {
  url: string;
  position: number;
}

/**
 * Postgres-shaped storage port for vehicle-sync. Every method's semantics
 * are load-bearing for correctness -- see each method's doc comment.
 */
export interface SyncStore {
  /** `select * from sync_event_log where source = $1 and event_id = $2`. */
  findEventLog(source: string, eventId: string): Promise<SyncEventLogRow | null>;

  /**
   * `insert into sync_event_log (...) values (...) on conflict (source,
   * event_id) do nothing returning *`. MUST return `null` (not throw) when a
   * concurrent/duplicate insert already exists for (source, eventId) --
   * mirrors zero-rows-affected, the real dedupe mechanism (design.md:
   * "insert ... on conflict do nothing; zero rows affected -> already
   * processed -> 200 OK, no side effect").
   */
  insertEventLog(row: NewSyncEventLogRow): Promise<SyncEventLogRow | null>;

  /** `update sync_event_log set ... where id = $1`. */
  updateEventLog(id: string, patch: Partial<Omit<SyncEventLogRow, "id">>): Promise<void>;

  /**
   * `select * from sync_event_log where status = 'failed' and next_attempt_at
   * <= $1` (reconcile-outbox's retry-drain half; design.md's reconcile scan
   * index covers this: `(status, next_attempt_at) where status in
   * ('received','failed')`).
   */
  listDueRetries(now: Date): Promise<SyncEventLogRow[]>;

  /** `select * from vehicle_snapshots where id = $1`. */
  getVehicleSnapshot(id: string): Promise<VehicleSnapshotRow | null>;

  /** `insert into tenants (id, name) values ($1, $2) on conflict (id) do update set name = excluded.name`. */
  upsertTenant(tenant: { id: string; name: string }): Promise<void>;

  /** `insert into vehicle_snapshots (...) values (...) on conflict (id) do update set ...`. */
  upsertVehicleSnapshot(row: VehicleSnapshotRow): Promise<void>;

  /** Replaces `vehicle_snapshot_photos` for a snapshot with the given set (delete + bulk insert). */
  replaceVehicleSnapshotPhotos(
    vehicleSnapshotId: string,
    photos: VehicleSnapshotPhotoInput[],
  ): Promise<void>;

  /**
   * `select coalesce(max(source_seq), 0) from sync_event_log where
   * aggregate_type = 'vehicle' and status = 'applied'`. Feeds
   * reconcile-outbox's gap-scan `since` parameter (design.md: "gap scan V2
   * `/outbox?since=<max applied seq>`").
   */
  getMaxAppliedSeq(): Promise<number>;
}
