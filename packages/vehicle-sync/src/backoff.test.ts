import { describe, expect, it } from "vitest";
import { computeBackoff } from "./backoff";

const NOW = new Date("2026-08-01T00:00:00.000Z");

describe("computeBackoff", () => {
  it.each([
    [1, 1 * 60_000],
    [2, 5 * 60_000],
    [3, 25 * 60_000],
    [4, 2 * 60 * 60_000],
    [5, 12 * 60 * 60_000],
  ])("schedules a retry after attempt %i using the %ims backoff step", (attempts, delayMs) => {
    const result = computeBackoff(attempts, NOW);

    expect(result).toEqual({
      status: "retry",
      nextAttemptAt: new Date(NOW.getTime() + delayMs),
    });
  });

  it("goes dead once all 5 backoff steps have been exhausted (6th failed attempt)", () => {
    const result = computeBackoff(6, NOW);

    expect(result).toEqual({ status: "dead" });
  });

  it("stays dead for any attempt count beyond 6", () => {
    const result = computeBackoff(42, NOW);

    expect(result).toEqual({ status: "dead" });
  });

  it("defaults `now` to the current time when not provided", () => {
    const before = Date.now();
    const result = computeBackoff(1);
    const after = Date.now();

    expect(result.status).toBe("retry");
    if (result.status === "retry") {
      const expectedMin = before + 60_000;
      const expectedMax = after + 60_000;
      expect(result.nextAttemptAt.getTime()).toBeGreaterThanOrEqual(expectedMin);
      expect(result.nextAttemptAt.getTime()).toBeLessThanOrEqual(expectedMax);
    }
  });
});
