import { z } from "zod";

// Inbound webhook payload from V2's outbox for a single vehicle-aggregate
// event (see vehicle-sync spec: "Outbox Ingestion"; design.md's
// `sync_event_log` idempotency section). Consumed by
// `supabase/functions/ingest-vehicle-event` AFTER HMAC signature
// verification (packages/vehicle-sync/src/hmac.ts) and by
// `reconcile-outbox`'s gap-scan (same shape, pulled instead of pushed).
//
// Field-to-column mapping deviation (documented per apply-progress
// convention): the fields persisted map 1:1 to `public.vehicle_snapshots`
// (supabase/migrations/0001_core_schema.sql) -- `make`, `model`, `year`,
// `ally_price`, `min_price`, `status`. The task brief additionally lists
// descriptive V2 attributes (`line`, `version`, `km`, `city`, `engine`,
// `transmission`) that have NO matching column in 0001-0004. Rather than
// hand-editing those already-merged/in-review migrations, or inventing
// speculative columns, this schema accepts them as optional forward-compat
// fields so the webhook contract doesn't reject a richer real V2 payload --
// but the ingest handler (packages/vehicle-sync/src/apply-event.ts)
// deliberately does NOT persist them. A future phase that needs them should
// add a real migration (0005+) and extend both this schema's *requiredness*
// and the ingest handler together.
//
// `status` is validated against an assumed closed enum -- `vehicle_snapshots
// .status` itself has no DB-level CHECK constraint (free `text`), so this is
// a client-side contract assumption pending confirmation from V2's real
// event shape, not an enforced invariant.
export const vehicleSnapshotStatusSchema = z.enum(["available", "reserved", "sold", "unlisted"]);

export const vehicleSyncPhotoSchema = z.object({
  url: z.url(),
  position: z.number().int().nonnegative().default(0),
});

export const vehicleSyncEventSchema = z.object({
  // Sync/idempotency envelope -- maps to `sync_event_log` columns.
  source_event_id: z.string().min(1),
  source_seq: z.number().int().nonnegative(),
  source_vehicle_id: z.uuid(),
  tenant_id: z.uuid(),
  // Not persisted on `vehicle_snapshots` (no such column) -- used only to
  // upsert a minimal `tenants` row when the vehicle's tenant hasn't been
  // synced yet, satisfying the `vehicle_snapshots.tenant_id` FK. Full tenant
  // sync is out of this phase's scope.
  tenant_name: z.string().min(1).optional(),

  // Persisted `vehicle_snapshots` columns.
  make: z.string().min(1),
  model: z.string().min(1),
  year: z.number().int().nullable().optional(),
  ally_price: z.number().nonnegative().nullable().optional(),
  min_price: z.number().nonnegative().nullable().optional(),
  status: vehicleSnapshotStatusSchema,

  // Persisted into `vehicle_snapshot_photos`.
  photos: z.array(vehicleSyncPhotoSchema).optional(),

  // Forward-compat only -- accepted, not persisted (see file-level comment).
  line: z.string().optional(),
  version: z.string().optional(),
  km: z.number().nonnegative().optional(),
  city: z.string().optional(),
  engine: z.string().optional(),
  transmission: z.string().optional(),
});

export type VehicleSnapshotStatus = z.infer<typeof vehicleSnapshotStatusSchema>;
export type VehicleSyncPhoto = z.infer<typeof vehicleSyncPhotoSchema>;
export type VehicleSyncEvent = z.infer<typeof vehicleSyncEventSchema>;
