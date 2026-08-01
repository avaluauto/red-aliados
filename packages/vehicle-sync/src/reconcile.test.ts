import type { VehicleSyncEvent } from "@red-aliados/contracts/zod";
import { describe, expect, it, vi } from "vitest";
import { runReconcileOutbox } from "./reconcile";
import { InMemorySyncStore } from "./testing/in-memory-store";

const VEHICLE_ID = "11111111-1111-4111-8111-111111111111";
const TENANT_ID = "22222222-2222-4222-8222-222222222222";
const NOW = new Date("2026-08-01T00:00:00.000Z");

function makeEvent(overrides: Partial<VehicleSyncEvent> = {}): VehicleSyncEvent {
  return {
    source_event_id: "v2-outbox-1",
    source_seq: 1,
    source_vehicle_id: VEHICLE_ID,
    tenant_id: TENANT_ID,
    tenant_name: "Dealer Uno",
    make: "Toyota",
    model: "Corolla",
    year: 2022,
    ally_price: 350000,
    min_price: 320000,
    status: "available",
    ...overrides,
  };
}

describe("runReconcileOutbox — retry drain", () => {
  it("retries a due 'failed' row and marks it 'applied' when the retry succeeds", async () => {
    const store = new InMemorySyncStore();
    const row = await store.insertEventLog({
      source: "v2-outbox",
      eventId: "v2-outbox-1",
      aggregateType: "vehicle",
      aggregateId: VEHICLE_ID,
      sourceSeq: 1,
      status: "failed",
      attempts: 1,
      nextAttemptAt: new Date(NOW.getTime() - 1000),
      payload: makeEvent(),
      error: "simulated earlier failure",
    });

    const result = await runReconcileOutbox({
      store,
      fetchOutboxSince: async () => [],
      now: NOW,
    });

    expect(result.retried).toEqual([{ eventLogId: row?.id, result: "applied" }]);
    const logRow = await store.findEventLog("v2-outbox", "v2-outbox-1");
    expect(logRow?.status).toBe("applied");
  });

  it("does not retry a 'failed' row whose next_attempt_at is still in the future", async () => {
    const store = new InMemorySyncStore();
    await store.insertEventLog({
      source: "v2-outbox",
      eventId: "v2-outbox-1",
      aggregateType: "vehicle",
      aggregateId: VEHICLE_ID,
      sourceSeq: 1,
      status: "failed",
      attempts: 1,
      nextAttemptAt: new Date(NOW.getTime() + 60_000),
      payload: makeEvent(),
      error: "simulated earlier failure",
    });

    const result = await runReconcileOutbox({ store, fetchOutboxSince: async () => [], now: NOW });

    expect(result.retried).toEqual([]);
  });

  it("increments attempts and applies the next backoff step when a retry fails again", async () => {
    const store = new InMemorySyncStore();
    store.upsertVehicleSnapshot = async () => {
      throw new Error("still failing");
    };
    const row = await store.insertEventLog({
      source: "v2-outbox",
      eventId: "v2-outbox-1",
      aggregateType: "vehicle",
      aggregateId: VEHICLE_ID,
      sourceSeq: 1,
      status: "failed",
      attempts: 2,
      nextAttemptAt: new Date(NOW.getTime() - 1000),
      payload: makeEvent(),
      error: "simulated earlier failure",
    });

    const result = await runReconcileOutbox({ store, fetchOutboxSince: async () => [], now: NOW });

    expect(result.retried).toEqual([{ eventLogId: row?.id, result: "failed" }]);
    const logRow = await store.findEventLog("v2-outbox", "v2-outbox-1");
    expect(logRow?.status).toBe("failed");
    expect(logRow?.attempts).toBe(3);
    expect(logRow?.nextAttemptAt).toEqual(new Date(NOW.getTime() + 25 * 60_000));
  });

  it("marks the row 'dead' once the 6th total attempt also fails", async () => {
    const store = new InMemorySyncStore();
    store.upsertVehicleSnapshot = async () => {
      throw new Error("still failing");
    };
    const row = await store.insertEventLog({
      source: "v2-outbox",
      eventId: "v2-outbox-1",
      aggregateType: "vehicle",
      aggregateId: VEHICLE_ID,
      sourceSeq: 1,
      status: "failed",
      attempts: 5,
      nextAttemptAt: new Date(NOW.getTime() - 1000),
      payload: makeEvent(),
      error: "simulated earlier failure",
    });

    const result = await runReconcileOutbox({ store, fetchOutboxSince: async () => [], now: NOW });

    expect(result.retried).toEqual([{ eventLogId: row?.id, result: "dead" }]);
    const logRow = await store.findEventLog("v2-outbox", "v2-outbox-1");
    expect(logRow?.status).toBe("dead");
    expect(logRow?.attempts).toBe(6);
  });
});

describe("runReconcileOutbox — gap scan", () => {
  it("calls fetchOutboxSince with the current max applied seq", async () => {
    const store = new InMemorySyncStore();
    await store.insertEventLog({
      source: "v2-outbox",
      eventId: "already-applied",
      aggregateType: "vehicle",
      aggregateId: VEHICLE_ID,
      sourceSeq: 7,
      status: "applied",
      attempts: 0,
      nextAttemptAt: null,
      payload: makeEvent({ source_seq: 7 }),
      error: null,
    });
    const fetchOutboxSince = vi.fn(async () => []);

    await runReconcileOutbox({ store, fetchOutboxSince, now: NOW });

    expect(fetchOutboxSince).toHaveBeenCalledWith(7);
  });

  it("repairs a dropped event: applies an event returned by the gap scan that was never delivered by webhook", async () => {
    const store = new InMemorySyncStore();
    const droppedEvent = makeEvent({ source_event_id: "dropped-1", source_seq: 1 });

    const result = await runReconcileOutbox({
      store,
      fetchOutboxSince: async () => [droppedEvent],
      now: NOW,
    });

    expect(result.gapScan).toEqual({ applied: 1, skippedStale: 0, duplicate: 0, failed: 0 });
    expect((await store.getVehicleSnapshot(VEHICLE_ID))?.lastSourceSeq).toBe(1);
  });

  it("counts an already-logged gap-scan event as a duplicate, not a re-apply", async () => {
    const store = new InMemorySyncStore();
    const event = makeEvent({ source_event_id: "already-there", source_seq: 1 });
    await store.insertEventLog({
      source: "v2-outbox",
      eventId: "already-there",
      aggregateType: "vehicle",
      aggregateId: VEHICLE_ID,
      sourceSeq: 1,
      status: "applied",
      attempts: 0,
      nextAttemptAt: null,
      payload: event,
      error: null,
    });

    const result = await runReconcileOutbox({
      store,
      fetchOutboxSince: async () => [event],
      now: NOW,
    });

    expect(result.gapScan.duplicate).toBe(1);
    expect(result.gapScan.applied).toBe(0);
  });
});
