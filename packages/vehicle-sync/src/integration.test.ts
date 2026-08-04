// Task 4.5 — integration-level proof of the three vehicle-sync scenarios
// spelled out in spec/vehicle-sync, driven through the same public
// entrypoints the Deno Edge Functions call (handleIngestVehicleEvent,
// runReconcileOutbox), sharing one store across webhook + reconcile calls
// exactly as they would in production (both point at the same Postgres).

import type { VehicleSyncEvent } from "@red-aliados/contracts/zod";
import { describe, expect, it } from "vitest";
import { signWebhookBody } from "./hmac";
import { handleIngestVehicleEvent } from "./ingest";
import { runReconcileOutbox } from "./reconcile";
import { InMemorySyncStore } from "./testing/in-memory-store";

const SECRET = "test-shared-secret";
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

async function deliverWebhook(store: InMemorySyncStore, event: VehicleSyncEvent) {
  const rawBody = JSON.stringify(event);
  const signatureHeader = await signWebhookBody(rawBody, SECRET);
  return handleIngestVehicleEvent({ rawBody, signatureHeader }, { store, secret: SECRET });
}

describe("vehicle-sync integration (spec: vehicle-sync scenarios)", () => {
  it("scenario: duplicate webhook delivery is a no-op", async () => {
    const store = new InMemorySyncStore();
    const event = makeEvent();

    const first = await deliverWebhook(store, event);
    const rowCountAfterFirst = store.eventLog.length;
    const second = await deliverWebhook(store, event);

    expect(first.outcome).toBe("applied");
    expect(second).toEqual({ outcome: "duplicate" });
    expect(store.eventLog).toHaveLength(rowCountAfterFirst);
    expect(store.eventLog.filter((row) => row.eventId === event.source_event_id)).toHaveLength(1);
  });

  it("scenario: out-of-order delivery results in skipped_stale, mirror keeps the newer state", async () => {
    const store = new InMemorySyncStore();
    await deliverWebhook(
      store,
      makeEvent({ source_event_id: "e-newer", source_seq: 10, status: "reserved" }),
    );

    const staleResult = await deliverWebhook(
      store,
      makeEvent({ source_event_id: "e-older", source_seq: 3, status: "sold" }),
    );

    expect(staleResult.outcome).toBe("skipped_stale");
    const snapshot = await store.getVehicleSnapshot(VEHICLE_ID);
    expect(snapshot).toMatchObject({ status: "reserved", lastSourceSeq: 10 });
    const staleLogRow = await store.findEventLog("v2-outbox", "e-older");
    expect(staleLogRow?.status).toBe("skipped_stale");
  });

  it("scenario: a dropped webhook delivery is repaired by reconcile-outbox's gap scan", async () => {
    const store = new InMemorySyncStore();
    // Vehicle-created event #1 was delivered fine via webhook.
    await deliverWebhook(
      store,
      makeEvent({ source_event_id: "e1", source_seq: 1, status: "available" }),
    );

    // Vehicle-updated event #2 was NEVER delivered -- simulates a dropped
    // webhook (network blip, function cold-start timeout, etc.). It exists
    // in V2's outbox but never reached ingest-vehicle-event, so it's absent
    // from sync_event_log entirely (not even 'failed' -- genuinely missing).
    const droppedEvent = makeEvent({ source_event_id: "e2", source_seq: 2, status: "reserved" });
    expect(await store.findEventLog("v2-outbox", "e2")).toBeNull();
    expect((await store.getVehicleSnapshot(VEHICLE_ID))?.status).toBe("available");

    const reconcileResult = await runReconcileOutbox({
      store,
      fetchOutboxSince: async (sinceSeq) => {
        expect(sinceSeq).toBe(1); // max applied seq before repair
        return [droppedEvent];
      },
    });

    expect(reconcileResult.gapScan).toEqual({
      applied: 1,
      skippedStale: 0,
      duplicate: 0,
      failed: 0,
    });
    const repaired = await store.getVehicleSnapshot(VEHICLE_ID);
    expect(repaired).toMatchObject({ status: "reserved", lastSourceSeq: 2 });
    expect((await store.findEventLog("v2-outbox", "e2"))?.status).toBe("applied");
  });
});
