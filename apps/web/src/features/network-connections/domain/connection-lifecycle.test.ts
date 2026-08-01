import { describe, expect, it } from "vitest";
import {
  applyTransition,
  canActOnSuggestion,
  canRespond,
  computeExpiresAt,
  EXPIRY_WINDOW_HOURS,
  isPastExpiry,
  isValidTransition,
  reciprocalEdgeTenantPairs,
  resolveEffectiveStatus,
} from "./connection-lifecycle";

const NOW = new Date("2026-08-01T12:00:00.000Z");
const REQUESTER = "11111111-1111-4111-8111-111111111111";
const RECIPIENT = "22222222-2222-4222-8222-222222222222";

describe("isValidTransition", () => {
  it("allows suggested -> pending", () => {
    expect(isValidTransition("suggested", "pending")).toBe(true);
  });

  it("allows pending -> accepted|rejected|expired", () => {
    expect(isValidTransition("pending", "accepted")).toBe(true);
    expect(isValidTransition("pending", "rejected")).toBe(true);
    expect(isValidTransition("pending", "expired")).toBe(true);
  });

  it("rejects suggested -> accepted|rejected|expired directly", () => {
    expect(isValidTransition("suggested", "accepted")).toBe(false);
    expect(isValidTransition("suggested", "rejected")).toBe(false);
    expect(isValidTransition("suggested", "expired")).toBe(false);
  });

  it("rejects any transition out of a terminal state", () => {
    expect(isValidTransition("accepted", "pending")).toBe(false);
    expect(isValidTransition("rejected", "pending")).toBe(false);
    expect(isValidTransition("expired", "pending")).toBe(false);
  });

  it("rejects a no-op transition to the same status", () => {
    expect(isValidTransition("pending", "pending")).toBe(false);
    expect(isValidTransition("suggested", "suggested")).toBe(false);
  });
});

describe("computeExpiresAt", () => {
  it("returns exactly 48 hours after the given instant", () => {
    const expiresAt = computeExpiresAt(NOW);

    expect(EXPIRY_WINDOW_HOURS).toBe(48);
    expect(expiresAt.toISOString()).toBe("2026-08-03T12:00:00.000Z");
  });
});

describe("applyTransition", () => {
  it("promoting suggested -> pending sets expires_at 48h out", () => {
    const outcome = applyTransition("suggested", "pending", NOW);

    expect(outcome).toEqual({
      ok: true,
      result: { status: "pending", expiresAt: computeExpiresAt(NOW) },
    });
  });

  it("accepting a pending request clears expires_at (terminal state)", () => {
    const outcome = applyTransition("pending", "accepted", NOW);

    expect(outcome).toEqual({
      ok: true,
      result: { status: "accepted", expiresAt: null },
    });
  });

  it("rejecting a pending request clears expires_at (terminal state)", () => {
    const outcome = applyTransition("pending", "rejected", NOW);

    expect(outcome).toEqual({
      ok: true,
      result: { status: "rejected", expiresAt: null },
    });
  });

  it("returns an error outcome for an invalid transition instead of throwing", () => {
    const outcome = applyTransition("suggested", "accepted", NOW);

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.error).toMatch(/suggested/);
      expect(outcome.error).toMatch(/accepted/);
    }
  });
});

describe("isPastExpiry", () => {
  it("is false for a null expires_at (suggested rows never expire)", () => {
    expect(isPastExpiry(null, NOW)).toBe(false);
  });

  it("is false while still within the window", () => {
    const expiresAt = new Date(NOW.getTime() + 1000);
    expect(isPastExpiry(expiresAt, NOW)).toBe(false);
  });

  it("is true once the instant is at or past expires_at", () => {
    const expiresAt = new Date(NOW.getTime() - 1000);
    expect(isPastExpiry(expiresAt, NOW)).toBe(true);
    expect(isPastExpiry(NOW, NOW)).toBe(true);
  });
});

describe("resolveEffectiveStatus", () => {
  it("returns 'expired' for a still-'pending' row whose window has passed, ahead of the pg_cron sweep", () => {
    const status = resolveEffectiveStatus(
      { status: "pending", expiresAt: new Date(NOW.getTime() - 1000) },
      NOW,
    );

    expect(status).toBe("expired");
  });

  it("returns the row's own status when not past expiry", () => {
    const status = resolveEffectiveStatus(
      { status: "pending", expiresAt: new Date(NOW.getTime() + 1000) },
      NOW,
    );

    expect(status).toBe("pending");
  });

  it("never overrides a terminal or suggested status", () => {
    expect(resolveEffectiveStatus({ status: "suggested", expiresAt: null }, NOW)).toBe("suggested");
    expect(resolveEffectiveStatus({ status: "accepted", expiresAt: new Date(0) }, NOW)).toBe(
      "accepted",
    );
  });
});

describe("canRespond / canActOnSuggestion", () => {
  it("canRespond is true only for 'pending'", () => {
    expect(canRespond("pending")).toBe(true);
    expect(canRespond("suggested")).toBe(false);
    expect(canRespond("accepted")).toBe(false);
    expect(canRespond("rejected")).toBe(false);
    expect(canRespond("expired")).toBe(false);
  });

  it("canActOnSuggestion is true only for 'suggested'", () => {
    expect(canActOnSuggestion("suggested")).toBe(true);
    expect(canActOnSuggestion("pending")).toBe(false);
  });
});

describe("reciprocalEdgeTenantPairs", () => {
  it("returns both directed (viewer, visible) pairs expected once accepted", () => {
    expect(reciprocalEdgeTenantPairs(REQUESTER, RECIPIENT)).toEqual([
      [REQUESTER, RECIPIENT],
      [RECIPIENT, REQUESTER],
    ]);
  });
});
