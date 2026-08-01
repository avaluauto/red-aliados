// Pure claim-shape validation for identity-bridge (spec: Claim Contract,
// Module Gate). Zero Supabase import here on purpose — this file is the
// "domain" layer in the hexagonal-lite split (design.md), so it must be
// testable without any I/O or third-party client. The `data/` layer is the
// only place allowed to talk to Supabase; it hands this module whatever raw
// claim bag `auth.getClaims()` resolved, already decoded.

export interface SessionClaims {
  readonly tenantId: string;
  readonly role: string;
  readonly redAliadosEnabled: boolean;
}

export type SessionClaimsResult =
  | { readonly valid: true; readonly claims: SessionClaims }
  | { readonly valid: false; readonly reason: string };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

/**
 * Validates the shape of the claim bag Supabase's Third-Party Auth exposes
 * once a V2-issued JWT verifies against V2's JWKS (identity-bridge:
 * Federated JWT Trust, Claim Contract).
 *
 * `tenant_id` and `role` are load-bearing identity claims — if either is
 * missing or malformed, the whole session is treated as invalid (mirrors
 * "Invalid or tampered JWT rejected": a claim-contract violation is as
 * untrustworthy as a bad signature). `red_aliados_enabled` is different: an
 * absent or non-boolean value fails CLOSED to `false` rather than
 * invalidating the session, because "Module Gate" explicitly treats
 * false/absent as a valid, renderable state (the disabled gate), not an
 * error.
 *
 * KNOWN RISK (flagged, not silently resolved): Supabase's own JWT contract
 * reserves a top-level `role` claim for PostgREST role switching (always
 * `"authenticated"` for a signed-in user — see @supabase/auth-js
 * `RequiredClaims`). spec.md's "Claim Contract" requirement names the
 * app-level dealer role claim `role` too. If V2 emits its custom role under
 * the same top-level `role` key, this collides with Postgres's own role
 * claim. This function reads whatever value is under `role` literally, per
 * spec — see the apply-progress/report Risks section for the follow-up
 * decision needed with V2 (e.g. a distinct claim key).
 */
export function parseSessionClaims(raw: unknown): SessionClaimsResult {
  if (typeof raw !== "object" || raw === null) {
    return { valid: false, reason: "claims payload is not an object" };
  }

  const bag = raw as Record<string, unknown>;

  const tenantId = bag.tenant_id;
  if (!isNonEmptyString(tenantId) || !UUID_PATTERN.test(tenantId)) {
    return { valid: false, reason: "tenant_id claim is missing or not a UUID" };
  }

  const role = bag.role;
  if (!isNonEmptyString(role)) {
    return { valid: false, reason: "role claim is missing or empty" };
  }

  const redAliadosEnabled = bag.red_aliados_enabled === true;

  return {
    valid: true,
    claims: { tenantId, role, redAliadosEnabled },
  };
}

/** Module Gate: the sole source of truth for whether Red Aliados access is open. */
export function isModuleEnabled(claims: SessionClaims): boolean {
  return claims.redAliadosEnabled === true;
}
