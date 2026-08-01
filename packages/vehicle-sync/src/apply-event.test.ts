import type { VehicleSyncEvent } from "@red-aliados/contracts/zod";
import { describe, expect, it } from "vitest";
import { applyNewEvent, applyToVehicleSnapshot } from "./apply-event";
import { InMemorySyncStore } from "./testing/in-memory-store";

const VEHICLE_ID = "11111111-1111-4111-8111-111111111111";
const TENANT_ID = "22222222-2222-4222-8222-222222222222";

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

describe("applyToVehicleSnapshot", () => {
  it("upserts the tenant and vehicle snapshot when there is no prior snapshot", async () => {
    const store = new InMemorySyncStore();

    const result = await applyToVehicleSnapshot(makeEvent(), store);

    expect(result).toEqual({ status: "applied" });
    const snapshot = await store.getVehicleSnapshot(VEHICLE_ID);
    expect(snapshot).toMatchObject({ make: "Toyota", model: "Corolla", lastSourceSeq: 1 });
    expect(store.tenants.get(TENANT_ID)).toEqual({ id: TENANT_ID, name: "Dealer Uno" });
  });

  it("persists photos when provided", async () => {
    const store = new InMemorySyncStore();

    await applyToVehicleSnapshot(
      makeEvent({ photos: [{ url: "https://cdn.example.com/a.jpg", position: 0 }] }),
      store,
    );

    expect(store.photosByVehicle.get(VEHICLE_ID)).toEqual([
      { url: "https://cdn.example.com/a.jpg", position: 0 },
    ]);
  });

  it("applies a newer event over an existing snapshot", async () => {
    const store = new InMemorySyncStore();
    await applyToVehicleSnapshot(makeEvent({ source_seq: 1, status: "available" }), store);

    const result = await applyToVehicleSnapshot(
      makeEvent({ source_seq: 2, status: "reserved" }),
      store,
    );

    expect(result).toEqual({ status: "applied" });
    const snapshot = await store.getVehicleSnapshot(VEHICLE_ID);
    expect(snapshot).toMatchObject({ status: "reserved", lastSourceSeq: 2 });
  });

  it("skips as stale when the incoming seq is <= the current snapshot's seq (out-of-order delivery)", async () => {
    const store = new InMemorySyncStore();
    await applyToVehicleSnapshot(makeEvent({ source_seq: 5, status: "available" }), store);

    const result = await applyToVehicleSnapshot(
      makeEvent({ source_seq: 3, status: "sold" }),
      store,
    );

    expect(result).toEqual({ status: "skipped_stale" });
    const snapshot = await store.getVehicleSnapshot(VEHICLE_ID);
    expect(snapshot).toMatchObject({ status: "available", lastSourceSeq: 5 });
  });

  it("skips as stale when the incoming seq exactly equals the current snapshot's seq", async () => {
    const store = new InMemorySyncStore();
    await applyToVehicleSnapshot(makeEvent({ source_seq: 5 }), store);

    const result = await applyToVehicleSnapshot(
      makeEvent({ source_seq: 5, status: "sold" }),
      store,
    );

    expect(result).toEqual({ status: "skipped_stale" });
  });
});

describe("applyNewEvent", () => {
  it("inserts a 'received' log row then marks it 'applied' on success", async () => {
    const store = new InMemorySyncStore();

    const result = await applyNewEvent(makeEvent(), store);

    expect(result.outcome).toBe("applied");
    const logRow = await store.findEventLog("v2-outbox", "v2-outbox-1");
    expect(logRow?.status).toBe("applied");
  });

  it("is a no-op returning 'duplicate' when the (source, event_id) pair already exists", async () => {
    const store = new InMemorySyncStore();
    await applyNewEvent(makeEvent(), store);
    const countAfterFirst = store.eventLog.length;

    const result = await applyNewEvent(makeEvent(), store);

    expect(result.outcome).toBe("duplicate");
    expect(store.eventLog.length).toBe(countAfterFirst);
  });

  it("marks the log row 'skipped_stale' for out-of-order delivery, without touching the snapshot", async () => {
    const store = new InMemorySyncStore();
    await applyNewEvent(makeEvent({ source_event_id: "e1", source_seq: 5 }), store);

    const result = await applyNewEvent(
      makeEvent({ source_event_id: "e2", source_seq: 2, status: "sold" }),
      store,
    );

    expect(result.outcome).toBe("skipped_stale");
    const logRow = await store.findEventLog("v2-outbox", "e2");
    expect(logRow?.status).toBe("skipped_stale");
    const snapshot = await store.getVehicleSnapshot(VEHICLE_ID);
    expect(snapshot?.status).toBe("available");
  });

  it("marks the log row 'failed' with attempts=1 and a scheduled retry when the upsert throws", async () => {
    const store = new InMemorySyncStore();
    store.upsertVehicleSnapshot = async () => {
      throw new Error("simulated DB error");
    };

    const result = await applyNewEvent(makeEvent(), store);

    expect(result.outcome).toBe("failed");
    const logRow = await store.findEventLog("v2-outbox", "v2-outbox-1");
    expect(logRow?.status).toBe("failed");
    expect(logRow?.attempts).toBe(1);
    expect(logRow?.nextAttemptAt).not.toBeNull();
    expect(logRow?.error).toContain("simulated DB error");
  });
});
