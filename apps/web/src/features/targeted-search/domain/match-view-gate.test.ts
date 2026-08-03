import { describe, expect, it } from "vitest";
import { isMatchActionable, markMatchViewed } from "./match-view-gate";

describe("isMatchActionable", () => {
  // No Auto-Share; Explicit Proceed Fires Opportunity Event (targeted-search
  // spec): "GIVEN a fan-out search returns a match WHEN the requester merely
  // views the match THEN no data has been shared ... and no Opportunity
  // exists yet." A match response arriving over the wire (RLS already scopes
  // it to the requester) is never actionable -- Proceed never enabled --
  // until the requester has taken the explicit "view" step client-side. This
  // is a UX safety net, not the enforcement point: the real guarantee is
  // insert_own_search_opportunity_out (0003_rls_policies.sql) plus the fact
  // that proceeding is a distinct, explicit mutation the requester must
  // trigger themselves.
  it("is false for a freshly-arrived, unviewed match", () => {
    expect(isMatchActionable("unviewed")).toBe(false);
  });

  it("is true only once the requester has explicitly viewed the match", () => {
    expect(isMatchActionable("viewed")).toBe(true);
  });
});

describe("markMatchViewed", () => {
  it("transitions an unviewed match to viewed", () => {
    expect(markMatchViewed("unviewed")).toBe("viewed");
  });

  it("is idempotent -- an already-viewed match stays viewed", () => {
    expect(markMatchViewed("viewed")).toBe("viewed");
  });
});
