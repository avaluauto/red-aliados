// Pure gate for connection-messaging (spec: Contact Reveal Only on
// Acceptance). Zero Supabase import on purpose (domain layer, hexagonal-lite
// split -- see identity-bridge/domain/session-claims.ts and
// tenant-directory/domain/visibility-rules.ts for the established pattern
// this file follows).
//
// A message thread is scoped 1:1 to a single connection_requests row (see
// network-connections/domain/connection-lifecycle.ts), so the contact-reveal
// decision reduces directly to that row's own status -- there is no
// arbitrary tenant-pair tier to resolve here the way tenant-directory's
// isContactRevealed(tier) does for a general "am I connected to this
// tenant" question. Both functions agree on the same underlying rule
// (tenant-directory: Contact Reveal Gated by Acceptance -- "revealed only
// once a mutual connection is ACCEPTED"): this one is just expressed against
// the request's status directly rather than a derived VisibilityTier, since
// that is the only input already available to a message-thread container
// (it already has the connection_requests row it is threading on; it does
// not need to separately resolve a tier for the counterpart tenant just to
// answer this one question).
import type { ConnectionRequestStatus } from "@/features/network-connections";

/**
 * Contact Reveal Only on Acceptance: the counterpart's phone/WhatsApp stays
 * hidden in the thread for every status except 'accepted'. Never for
 * 'suggested'/'pending' (not yet accepted), and never again for
 * 'rejected'/'expired' (never became accepted).
 */
export function isMessagingContactRevealed(status: ConnectionRequestStatus): boolean {
  return status === "accepted";
}
