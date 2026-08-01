// Real (Postgres-backed, via PostgREST) implementation of the `SyncStore`
// port (packages/vehicle-sync/src/store.ts). Deno-only -- see README.md at
// the top of this directory for why, and for what was/wasn't verified.
//
// NOT executed in this sandbox: no live Supabase project exists yet (see
// supabase/THIRD_PARTY_AUTH.md's "Status: NOT CONFIGURED" from PR2 -- same
// situation here), and no Deno runtime is installed to even `deno check`
// this file. Written to the best-known @supabase/supabase-js v2 API shape;
// treat as unverified production wiring until a real project exists.

// deno-lint-ignore-file
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.111.0";
import type {
  NewSyncEventLogRow,
  SyncEventLogRow,
  SyncStore,
  VehicleSnapshotPhotoInput,
  VehicleSnapshotRow,
} from "../../../packages/vehicle-sync/src/store.ts";

interface SyncEventLogTableRow {
  id: string;
  source: string;
  event_id: string;
  aggregate_type: "vehicle" | "tenant";
  aggregate_id: string;
  source_seq: number;
  status: SyncEventLogRow["status"];
  attempts: number;
  next_attempt_at: string | null;
  payload: unknown;
  error: string | null;
}

function fromTableRow(row: SyncEventLogTableRow): SyncEventLogRow {
  return {
    id: row.id,
    source: row.source,
    eventId: row.event_id,
    aggregateType: row.aggregate_type,
    aggregateId: row.aggregate_id,
    sourceSeq: row.source_seq,
    status: row.status,
    attempts: row.attempts,
    nextAttemptAt: row.next_attempt_at ? new Date(row.next_attempt_at) : null,
    payload: row.payload,
    error: row.error,
  };
}

export class SupabaseSyncStore implements SyncStore {
  private readonly client: SupabaseClient;

  constructor(supabaseUrl: string, serviceRoleKey: string) {
    // service_role key -- deliberately bypasses RLS. This function is the
    // only writer for vehicle_snapshots/tenants/sync_event_log; RLS on
    // those tables (0003_rls_policies.sql) denies authenticated/anon writes
    // entirely, by design (vehicle-sync spec: "Read-Only Mirror").
    this.client = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });
  }

  async findEventLog(source: string, eventId: string): Promise<SyncEventLogRow | null> {
    const { data, error } = await this.client
      .from("sync_event_log")
      .select("*")
      .eq("source", source)
      .eq("event_id", eventId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data ? fromTableRow(data as SyncEventLogTableRow) : null;
  }

  async insertEventLog(row: NewSyncEventLogRow): Promise<SyncEventLogRow | null> {
    // `ignoreDuplicates: true` + `onConflict` is the supabase-js v2 idiom
    // for `insert ... on conflict (source, event_id) do nothing returning
    // *` — a duplicate resolves to an empty `data` array, not an error,
    // which is exactly what `SyncStore.insertEventLog`'s contract requires
    // (return `null`, never throw, on a dedupe hit). Requires the DB-level
    // `unique (source, event_id)` constraint from 0001_core_schema.sql to
    // exist for `onConflict` to have a target.
    const { data, error } = await this.client
      .from("sync_event_log")
      .upsert(
        {
          source: row.source,
          event_id: row.eventId,
          aggregate_type: row.aggregateType,
          aggregate_id: row.aggregateId,
          source_seq: row.sourceSeq,
          status: row.status,
          attempts: row.attempts,
          next_attempt_at: row.nextAttemptAt ? row.nextAttemptAt.toISOString() : null,
          payload: row.payload,
          error: row.error,
        },
        { onConflict: "source,event_id", ignoreDuplicates: true },
      )
      .select("*");
    if (error) throw new Error(error.message);
    const inserted = data?.[0];
    return inserted ? fromTableRow(inserted as SyncEventLogTableRow) : null;
  }

  async updateEventLog(id: string, patch: Partial<Omit<SyncEventLogRow, "id">>): Promise<void> {
    const { error } = await this.client
      .from("sync_event_log")
      .update({
        ...(patch.status !== undefined ? { status: patch.status } : {}),
        ...(patch.attempts !== undefined ? { attempts: patch.attempts } : {}),
        ...(patch.nextAttemptAt !== undefined
          ? { next_attempt_at: patch.nextAttemptAt ? patch.nextAttemptAt.toISOString() : null }
          : {}),
        ...(patch.error !== undefined ? { error: patch.error } : {}),
      })
      .eq("id", id);
    if (error) throw new Error(error.message);
  }

  async listDueRetries(now: Date): Promise<SyncEventLogRow[]> {
    const { data, error } = await this.client
      .from("sync_event_log")
      .select("*")
      .eq("status", "failed")
      .lte("next_attempt_at", now.toISOString());
    if (error) throw new Error(error.message);
    return (data ?? []).map((row) => fromTableRow(row as SyncEventLogTableRow));
  }

  async getVehicleSnapshot(id: string): Promise<VehicleSnapshotRow | null> {
    const { data, error } = await this.client
      .from("vehicle_snapshots")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    return {
      id: data.id,
      tenantId: data.tenant_id,
      make: data.make,
      model: data.model,
      year: data.year,
      allyPrice: data.ally_price,
      minPrice: data.min_price,
      status: data.status,
      lastSourceSeq: data.last_source_seq,
    };
  }

  async upsertTenant(tenant: { id: string; name: string }): Promise<void> {
    const { error } = await this.client
      .from("tenants")
      .upsert({ id: tenant.id, name: tenant.name });
    if (error) throw new Error(error.message);
  }

  async upsertVehicleSnapshot(row: VehicleSnapshotRow): Promise<void> {
    const { error } = await this.client.from("vehicle_snapshots").upsert({
      id: row.id,
      tenant_id: row.tenantId,
      make: row.make,
      model: row.model,
      year: row.year,
      ally_price: row.allyPrice,
      min_price: row.minPrice,
      status: row.status,
      last_source_seq: row.lastSourceSeq,
    });
    if (error) throw new Error(error.message);
  }

  async replaceVehicleSnapshotPhotos(
    vehicleSnapshotId: string,
    photos: VehicleSnapshotPhotoInput[],
  ): Promise<void> {
    const { error: deleteError } = await this.client
      .from("vehicle_snapshot_photos")
      .delete()
      .eq("vehicle_snapshot_id", vehicleSnapshotId);
    if (deleteError) throw new Error(deleteError.message);

    if (photos.length === 0) return;

    const { error: insertError } = await this.client.from("vehicle_snapshot_photos").insert(
      photos.map((photo) => ({
        vehicle_snapshot_id: vehicleSnapshotId,
        url: photo.url,
        position: photo.position,
      })),
    );
    if (insertError) throw new Error(insertError.message);
  }

  async getMaxAppliedSeq(): Promise<number> {
    const { data, error } = await this.client
      .from("sync_event_log")
      .select("source_seq")
      .eq("aggregate_type", "vehicle")
      .eq("status", "applied")
      .order("source_seq", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data?.source_seq ?? 0;
  }
}
