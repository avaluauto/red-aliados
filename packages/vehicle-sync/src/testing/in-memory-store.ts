// Test-only fake implementing the real `SyncStore` contract (src/store.ts)
// with the exact semantics a real Postgres-backed implementation must have
// (dedupe via unique-constraint-shaped rejection, not a mocked stub). Used
// by this package's own test suite -- NOT exported from the public barrel
// (src/index.ts), matching identity-bridge/network-authorization's pattern
// of keeping test doubles out of the production surface.

import { randomUUID } from "node:crypto";
import type {
  NewSyncEventLogRow,
  SyncEventLogRow,
  SyncStore,
  VehicleSnapshotPhotoInput,
  VehicleSnapshotRow,
} from "../store";

export class InMemorySyncStore implements SyncStore {
  readonly eventLog: SyncEventLogRow[] = [];
  readonly vehicleSnapshots = new Map<string, VehicleSnapshotRow>();
  readonly tenants = new Map<string, { id: string; name: string }>();
  readonly photosByVehicle = new Map<string, VehicleSnapshotPhotoInput[]>();

  async findEventLog(source: string, eventId: string): Promise<SyncEventLogRow | null> {
    return this.eventLog.find((row) => row.source === source && row.eventId === eventId) ?? null;
  }

  async insertEventLog(row: NewSyncEventLogRow): Promise<SyncEventLogRow | null> {
    const existing = await this.findEventLog(row.source, row.eventId);
    if (existing) {
      // Mirrors `on conflict (source, event_id) do nothing` -- zero rows affected.
      return null;
    }

    const created: SyncEventLogRow = { ...row, id: randomUUID() };
    this.eventLog.push(created);
    return created;
  }

  async updateEventLog(id: string, patch: Partial<Omit<SyncEventLogRow, "id">>): Promise<void> {
    const index = this.eventLog.findIndex((row) => row.id === id);
    if (index === -1) {
      throw new Error(`sync_event_log row not found: ${id}`);
    }
    // biome-ignore lint/style/noNonNullAssertion: index bound-checked above
    this.eventLog[index] = { ...this.eventLog[index]!, ...patch };
  }

  async listDueRetries(now: Date): Promise<SyncEventLogRow[]> {
    return this.eventLog.filter(
      (row) => row.status === "failed" && row.nextAttemptAt !== null && row.nextAttemptAt <= now,
    );
  }

  async getVehicleSnapshot(id: string): Promise<VehicleSnapshotRow | null> {
    return this.vehicleSnapshots.get(id) ?? null;
  }

  async upsertTenant(tenant: { id: string; name: string }): Promise<void> {
    this.tenants.set(tenant.id, tenant);
  }

  async upsertVehicleSnapshot(row: VehicleSnapshotRow): Promise<void> {
    this.vehicleSnapshots.set(row.id, row);
  }

  async replaceVehicleSnapshotPhotos(
    vehicleSnapshotId: string,
    photos: VehicleSnapshotPhotoInput[],
  ): Promise<void> {
    this.photosByVehicle.set(vehicleSnapshotId, photos);
  }

  async getMaxAppliedSeq(): Promise<number> {
    return this.eventLog
      .filter((row) => row.aggregateType === "vehicle" && row.status === "applied")
      .reduce((max, row) => Math.max(max, row.sourceSeq), 0);
  }
}
