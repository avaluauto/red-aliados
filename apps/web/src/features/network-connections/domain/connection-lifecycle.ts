// Pure lifecycle rules for the network-connections state machine (spec:
// "suggested -> pending -> accepted|rejected|expired", 48-Hour Expiry with
// Double Opt-In, Suggested Status for Seeded Requests). Zero Supabase import
// on purpose (domain layer, hexagonal-lite split -- see
// identity-bridge/domain/session-claims.ts / network-authorization/domain/
// visibility-tier.ts for the established pattern this file follows).
//
// The REAL enforcement of these transitions (and the reciprocal
// connection_edges creation on acceptance) lives in Postgres
// (supabase/migrations/0006_pg_cron_expire_requests.sql's
// app.handle_connection_request_transition() trigger), per design.md:
// "Enforcement lives in Postgres, not the client." This module exists so the
// client can (a) decide which actions to offer/disable in the UI without a
// round trip, and (b) optimistically resolve a still-'pending' row as
// 'expired' once its window has passed, ahead of the pg_cron sweep (task
// 6.3) actually writing that row -- exactly the same "UX convenience only"
// relationship network-authorization's client guard has with RLS.

export type ConnectionRequestStatus = "suggested" | "pending" | "accepted" | "rejected" | "expired";

export type ConnectionRequestOriginType = "vehicle_interest" | "search_match" | "direct";

/**
 * `direct` is deliberately excluded here: per network-connections' Manual
 * Cold-Start Seeding requirement, only an operator/service role may create a
 * `direct`-origin row (Supabase Studio / service_role, which bypasses RLS).
 * The client-facing create-request path (data/connection-requests-queries.ts)
 * is typed to this narrower union so it is not even possible, at the type
 * level, to accidentally wire a UI control that requests `origin_type:
 * 'direct'` -- the RLS `insert_own_request` policy would reject it anyway,
 * but this keeps the client's own type surface honest about what it can do.
 */
export type ClientCreatableOriginType = Exclude<ConnectionRequestOriginType, "direct">;

/** Suggested Status for Seeded Requests / 48-Hour Expiry with Double Opt-In. */
export const EXPIRY_WINDOW_HOURS = 48;

const VALID_TRANSITIONS: Readonly<
  Record<ConnectionRequestStatus, readonly ConnectionRequestStatus[]>
> = {
  suggested: ["pending"],
  pending: ["accepted", "rejected", "expired"],
  accepted: [],
  rejected: [],
  expired: [],
};

export function isValidTransition(
  from: ConnectionRequestStatus,
  to: ConnectionRequestStatus,
): boolean {
  return VALID_TRANSITIONS[from].includes(to);
}

/** Suggested Status for Seeded Requests: acting on a suggestion sets expires_at = now + 48h. */
export function computeExpiresAt(now: Date): Date {
  return new Date(now.getTime() + EXPIRY_WINDOW_HOURS * 60 * 60 * 1000);
}

export interface TransitionResult {
  readonly status: ConnectionRequestStatus;
  readonly expiresAt: Date | null;
}

export type TransitionOutcome =
  | { readonly ok: true; readonly result: TransitionResult }
  | { readonly ok: false; readonly error: string };

/**
 * Computes the resulting {status, expiresAt} for a requested transition, or
 * an error outcome (never throws) when the transition is not allowed by the
 * state machine. Mirrors exactly what the Postgres trigger
 * (app.handle_connection_request_transition, 0006) enforces server-side --
 * this is the UX-preview half, not the enforcement.
 */
export function applyTransition(
  current: ConnectionRequestStatus,
  target: ConnectionRequestStatus,
  now: Date,
): TransitionOutcome {
  if (!isValidTransition(current, target)) {
    return {
      ok: false,
      error: `invalid connection_requests status transition: ${current} -> ${target}`,
    };
  }

  if (current === "suggested" && target === "pending") {
    return { ok: true, result: { status: "pending", expiresAt: computeExpiresAt(now) } };
  }

  // pending -> accepted|rejected|expired: every one of these is terminal (or
  // externally re-derived by the pg_cron sweep for 'expired'), so there is no
  // future expiry to track anymore.
  return { ok: true, result: { status: target, expiresAt: null } };
}

/** Is `expiresAt` at or before `now`? Always false for a null expires_at (suggested rows). */
export function isPastExpiry(expiresAt: Date | null, now: Date): boolean {
  if (!expiresAt) {
    return false;
  }
  return expiresAt.getTime() <= now.getTime();
}

export interface ConnectionRequestLike {
  readonly status: ConnectionRequestStatus;
  readonly expiresAt: Date | null;
}

/**
 * Client-side optimistic status: a row still marked 'pending' whose
 * expires_at has already passed is treated as 'expired' in the UI even
 * before the pg_cron auto-expiry sweep (task 6.3) has run and written that
 * row -- same "convenience preview, not the enforcement point" relationship
 * every other domain/ mirror in this codebase has with its Postgres
 * counterpart.
 */
export function resolveEffectiveStatus(
  request: ConnectionRequestLike,
  now: Date,
): ConnectionRequestStatus {
  if (request.status === "pending" && isPastExpiry(request.expiresAt, now)) {
    return "expired";
  }
  return request.status;
}

/** Only a 'pending' request can be accepted or rejected (by its recipient -- see RLS 0003). */
export function canRespond(status: ConnectionRequestStatus): boolean {
  return status === "pending";
}

/** Only a 'suggested' request can be acted on (promoted to 'pending'). */
export function canActOnSuggestion(status: ConnectionRequestStatus): boolean {
  return status === "suggested";
}

/**
 * The two directed (viewer_tenant_id, visible_tenant_id) pairs the
 * acceptance trigger (0006) is expected to insert into connection_edges.
 * Pure helper so both the UI (rendering "connected both ways" confirmation)
 * and tests can assert the two directions without duplicating the pairing
 * logic (network-connections: "reciprocal `connection_edges` rows are
 * created for both tenants").
 */
export function reciprocalEdgeTenantPairs(
  requesterTenantId: string,
  recipientTenantId: string,
): readonly [string, string][] {
  return [
    [requesterTenantId, recipientTenantId],
    [recipientTenantId, requesterTenantId],
  ];
}
