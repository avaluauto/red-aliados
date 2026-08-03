// Pure opt-in view gate for a fan-out match response (spec: No Auto-Share;
// Explicit Proceed Fires Opportunity Event). Zero Supabase import on purpose
// (domain layer, hexagonal-lite split -- same convention every other
// domain/ file in this codebase follows).
//
// A match response (a `search_match`-origin connection_requests row created
// by a target tenant -- see ../data/targeted-search-queries.ts) is already
// scoped to the requester by RLS (select_own_connection_requests, 0003) the
// moment it is created. That is NOT the same thing as the match being
// actionable: "GIVEN a fan-out search returns a match WHEN the requester
// merely views the match THEN no data has been shared ... and no
// Opportunity exists yet." This module models that as an explicit,
// client-only view gate -- entirely separate from the DB, never persisted
// -- so "Proceed" can never be triggered on a match the requester has not
// deliberately chosen to look at first. It is a UX safety net around the
// real enforcement point (insert_own_search_opportunity_out, 0003), not a
// substitute for it.

export type MatchViewState = "unviewed" | "viewed";

/** Every match response starts here -- never actionable on arrival. */
export const INITIAL_MATCH_VIEW_STATE: MatchViewState = "unviewed";

/** A match is actionable (Proceed enabled) only once explicitly viewed. */
export function isMatchActionable(state: MatchViewState): boolean {
  return state === "viewed";
}

/** The only transition this gate defines: an explicit "view" action. */
export function markMatchViewed(_state: MatchViewState): MatchViewState {
  return "viewed";
}
