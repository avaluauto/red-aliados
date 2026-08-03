// Pure masking rules for tenant-directory (spec: Reputation Visible
// Pre-Connection, Contact Reveal Gated by Acceptance). Zero Supabase import
// here on purpose -- domain layer, hexagonal-lite split (design.md), same
// convention as identity-bridge/domain/session-claims.ts and
// network-authorization/domain/visibility-tier.ts.
//
// Both functions are UX-mirrors of enforcement that already happens
// server-side: `contact_phone`/`tenant_name` are already masked to null
// below the `connected` tier by vehicle_snapshots_public (0004), and
// reputation_events' own RLS policy (0003, select_reputation_events) already
// restricts rows to the caller's own tenant or a candidate/connected target.
// Mirroring the rule here -- rather than trusting "the query returned data
// so it must be fine to render" -- is the same defense-in-depth pattern
// network-authorization's client guard established: the DB is the real
// enforcement point, this is a second, independently-testable check before
// the component renders anything sensitive.
import type { VisibilityTier } from "@/features/network-authorization";

/**
 * Contact Reveal Gated by Acceptance: phone/WhatsApp is revealed only once a
 * mutual connection is ACCEPTED (`connected` tier, an active
 * connection_edges row) or for the caller's own tenant (`owner`). Never for
 * `candidate` (still suggested/pending) or `none`.
 */
export function isContactRevealed(tier: VisibilityTier): boolean {
  return tier === "connected" || tier === "owner";
}

/**
 * Reputation Visible Pre-Connection: reputation is visible whenever a
 * suggested/pending connection_requests row (`candidate`) or an active
 * connection (`connected`) links the two tenants, or it is the caller's own
 * tenant (`owner`). Never for `none` -- there is no open directory browsing
 * of the entire network (spec: "zero rows ... for that tenant").
 */
export function isReputationVisible(tier: VisibilityTier): boolean {
  return tier !== "none";
}
