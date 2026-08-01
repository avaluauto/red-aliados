import { describe, expect, it } from "vitest";
import {
  computeReputationScore,
  EXPIRY_WINDOW_SECONDS,
  type ReputationEventInput,
} from "./reputation-score";

function event(
  eventType: ReputationEventInput["eventType"],
  responseTimeSeconds: number,
): ReputationEventInput {
  return { eventType, responseTimeSeconds };
}

describe("computeReputationScore", () => {
  it("returns a null score with sampleSize 0 for a tenant with no terminal events yet", () => {
    expect(computeReputationScore([])).toEqual({ score: null, sampleSize: 0 });
  });

  it("scores an immediate acceptance at the top of the accepted range", () => {
    const result = computeReputationScore([event("accepted", 0)]);
    expect(result.score).toBe(100);
    expect(result.sampleSize).toBe(1);
  });

  it("scores an acceptance that used the full window at the accepted floor", () => {
    const result = computeReputationScore([event("accepted", EXPIRY_WINDOW_SECONDS)]);
    expect(result.score).toBe(20);
  });

  it("scores an immediate rejection lower than an immediate acceptance but still positive", () => {
    const result = computeReputationScore([event("rejected", 0)]);
    expect(result.score).toBe(60);
  });

  it("scores expiry at 0 regardless of response time", () => {
    expect(computeReputationScore([event("expired", 0)]).score).toBe(0);
    expect(computeReputationScore([event("expired", EXPIRY_WINDOW_SECONDS)]).score).toBe(0);
    expect(computeReputationScore([event("expired", 999_999)]).score).toBe(0);
  });

  it("REQUIREMENT (partner-reputation: Score Computation and Expiry Penalty) -- expiry penalizes more than an explicit rejection of equivalent context (same elapsed time)", () => {
    const elapsed = EXPIRY_WINDOW_SECONDS; // both requests occupied the identical 48h window
    const expiredScore = computeReputationScore([event("expired", elapsed)]).score as number;
    const rejectedScore = computeReputationScore([event("rejected", elapsed)]).score as number;

    expect(expiredScore).toBeLessThan(rejectedScore);
  });

  it("expiry still penalizes more than rejection even for a very fast rejection vs. a very slow expiry (the widest possible gap)", () => {
    const expiredScore = computeReputationScore([event("expired", 1)]).score as number;
    const rejectedScore = computeReputationScore([event("rejected", 0)]).score as number;

    expect(expiredScore).toBeLessThan(rejectedScore);
  });

  it("averages multiple events for the same tenant", () => {
    const result = computeReputationScore([event("accepted", 0), event("rejected", 0)]);
    expect(result.score).toBe(80); // (100 + 60) / 2
    expect(result.sampleSize).toBe(2);
  });

  it("clamps out-of-range response times instead of producing a negative or >100 score", () => {
    expect(computeReputationScore([event("accepted", -100)]).score).toBe(100);
    expect(computeReputationScore([event("accepted", EXPIRY_WINDOW_SECONDS * 5)]).score).toBe(20);
  });
});
