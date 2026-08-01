// Public surface for @red-aliados/vehicle-sync. Consumed by the Deno
// entrypoints under supabase/functions/{ingest-vehicle-event,
// reconcile-outbox}/index.ts via a relative import (Deno resolves plain
// ESM .ts files directly -- no node_modules/pnpm-workspace resolution
// needed there, so a relative path works better across the Deno/Node
// boundary than the `@red-aliados/vehicle-sync` package specifier would).
//
// Test doubles (src/testing/in-memory-store.ts) are intentionally NOT
// re-exported here -- production code never depends on them.

export {
  type ApplyNewEventResult,
  type ApplyToVehicleSnapshotResult,
  applyNewEvent,
  applyToVehicleSnapshot,
} from "./apply-event";
export { type BackoffResult, computeBackoff, MAX_RETRY_ATTEMPTS } from "./backoff";
export { signWebhookBody, verifyWebhookSignature } from "./hmac";
export {
  handleIngestVehicleEvent,
  type IngestDeps,
  type IngestRequest,
  type IngestResult,
} from "./ingest";
export {
  type FetchOutboxSince,
  type GapScanOutcome,
  type ReconcileDeps,
  type ReconcileResult,
  type RetryOutcome,
  runReconcileOutbox,
} from "./reconcile";
export type {
  NewSyncEventLogRow,
  SyncEventLogRow,
  SyncEventStatus,
  SyncStore,
  VehicleSnapshotPhotoInput,
  VehicleSnapshotRow,
} from "./store";
