import { describe, expect, it } from "vitest";
import { signWebhookBody } from "./hmac";
import { handleIngestVehicleEvent } from "./ingest";
import { InMemorySyncStore } from "./testing/in-memory-store";

const SECRET = "test-shared-secret";
const VEHICLE_ID = "11111111-1111-4111-8111-111111111111";
const TENANT_ID = "22222222-2222-4222-8222-222222222222";

function eventPayload(overrides: Record<string, unknown> = {}) {
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

async function signedRequest(payload: Record<string, unknown>) {
  const rawBody = JSON.stringify(payload);
  const signature = await signWebhookBody(rawBody, SECRET);
  return { rawBody, signatureHeader: signature };
}

describe("handleIngestVehicleEvent", () => {
  it("applies a validly-signed, well-formed, new event", async () => {
    const store = new InMemorySyncStore();
    const req = await signedRequest(eventPayload());

    const result = await handleIngestVehicleEvent(req, { store, secret: SECRET });

    expect(result).toEqual({ outcome: "applied", eventLogId: expect.any(String) });
    expect((await store.getVehicleSnapshot(VEHICLE_ID))?.make).toBe("Toyota");
  });

  it("rejects requests with an invalid or missing signature before touching the store", async () => {
    const store = new InMemorySyncStore();
    const rawBody = JSON.stringify(eventPayload());

    const result = await handleIngestVehicleEvent(
      { rawBody, signatureHeader: null },
      { store, secret: SECRET },
    );

    expect(result).toEqual({ outcome: "invalid_signature" });
    expect(store.eventLog).toHaveLength(0);
  });

  it("rejects a validly-signed body that is not valid JSON", async () => {
    const store = new InMemorySyncStore();
    const rawBody = "not json";
    const signatureHeader = await signWebhookBody(rawBody, SECRET);

    const result = await handleIngestVehicleEvent(
      { rawBody, signatureHeader },
      { store, secret: SECRET },
    );

    expect(result.outcome).toBe("invalid_payload");
  });

  it("rejects a validly-signed, valid-JSON body that fails schema validation", async () => {
    const store = new InMemorySyncStore();
    const req = await signedRequest(eventPayload({ status: "not-a-real-status" }));

    const result = await handleIngestVehicleEvent(req, { store, secret: SECRET });

    expect(result.outcome).toBe("invalid_payload");
    expect(store.eventLog).toHaveLength(0);
  });

  it("duplicate webhook delivery is a no-op (spec: 'Duplicate webhook delivery is a no-op')", async () => {
    const store = new InMemorySyncStore();
    const req = await signedRequest(eventPayload());
    await handleIngestVehicleEvent(req, { store, secret: SECRET });
    const countAfterFirst = store.eventLog.length;

    const result = await handleIngestVehicleEvent(req, { store, secret: SECRET });

    expect(result).toEqual({ outcome: "duplicate" });
    expect(store.eventLog.length).toBe(countAfterFirst);
  });

  it("out-of-order delivery (lower source_seq than the current snapshot) is skipped_stale", async () => {
    const store = new InMemorySyncStore();
    await handleIngestVehicleEvent(await signedRequest(eventPayload({ source_seq: 5 })), {
      store,
      secret: SECRET,
    });

    const result = await handleIngestVehicleEvent(
      await signedRequest(
        eventPayload({ source_event_id: "v2-outbox-2", source_seq: 2, status: "sold" }),
      ),
      { store, secret: SECRET },
    );

    expect(result.outcome).toBe("skipped_stale");
    expect((await store.getVehicleSnapshot(VEHICLE_ID))?.lastSourceSeq).toBe(5);
  });
});
