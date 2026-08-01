import { describe, expect, it } from "vitest";
import { vehicleSyncEventSchema } from "./vehicle-sync";

const VALID_EVENT = {
  source_event_id: "v2-outbox-00042",
  source_seq: 42,
  source_vehicle_id: "11111111-1111-4111-8111-111111111111",
  tenant_id: "22222222-2222-4222-8222-222222222222",
  tenant_name: "Dealer Uno",
  make: "Toyota",
  model: "Corolla",
  year: 2022,
  ally_price: 350000,
  min_price: 320000,
  status: "available",
};

describe("vehicleSyncEventSchema", () => {
  it("accepts a fully-populated valid event", () => {
    const result = vehicleSyncEventSchema.safeParse(VALID_EVENT);

    expect(result.success).toBe(true);
  });

  it("accepts an event with photos", () => {
    const result = vehicleSyncEventSchema.safeParse({
      ...VALID_EVENT,
      photos: [
        { url: "https://cdn.example.com/a.jpg", position: 0 },
        { url: "https://cdn.example.com/b.jpg" },
      ],
    });

    expect(result.success).toBe(true);
  });

  it("accepts descriptive-only V2 fields not persisted in Phase 4 (forward-compat passthrough)", () => {
    const result = vehicleSyncEventSchema.safeParse({
      ...VALID_EVENT,
      line: "XEI",
      version: "2.0 CVT",
      km: 15000,
      city: "Buenos Aires",
      engine: "2.0L",
      transmission: "automatic",
    });

    expect(result.success).toBe(true);
  });

  it("allows year and prices to be explicitly null", () => {
    const result = vehicleSyncEventSchema.safeParse({
      ...VALID_EVENT,
      year: null,
      ally_price: null,
      min_price: null,
    });

    expect(result.success).toBe(true);
  });

  it("allows tenant_name to be omitted", () => {
    const { tenant_name, ...withoutTenantName } = VALID_EVENT;

    const result = vehicleSyncEventSchema.safeParse(withoutTenantName);

    expect(result.success).toBe(true);
  });

  it.each([
    "source_event_id",
    "source_seq",
    "source_vehicle_id",
    "tenant_id",
    "make",
    "model",
    "status",
  ])("rejects a missing required field: %s", (field) => {
    const { [field]: _omit, ...incomplete } = VALID_EVENT as Record<string, unknown>;

    const result = vehicleSyncEventSchema.safeParse(incomplete);

    expect(result.success).toBe(false);
  });

  it("rejects an unknown status value", () => {
    const result = vehicleSyncEventSchema.safeParse({
      ...VALID_EVENT,
      status: "not-a-real-status",
    });

    expect(result.success).toBe(false);
  });

  it("rejects a negative source_seq", () => {
    const result = vehicleSyncEventSchema.safeParse({ ...VALID_EVENT, source_seq: -1 });

    expect(result.success).toBe(false);
  });

  it("rejects a non-integer source_seq", () => {
    const result = vehicleSyncEventSchema.safeParse({ ...VALID_EVENT, source_seq: 1.5 });

    expect(result.success).toBe(false);
  });

  it("rejects a non-uuid source_vehicle_id", () => {
    const result = vehicleSyncEventSchema.safeParse({
      ...VALID_EVENT,
      source_vehicle_id: "not-a-uuid",
    });

    expect(result.success).toBe(false);
  });

  it("rejects a negative ally_price", () => {
    const result = vehicleSyncEventSchema.safeParse({ ...VALID_EVENT, ally_price: -1 });

    expect(result.success).toBe(false);
  });
});
