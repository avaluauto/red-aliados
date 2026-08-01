// Pure client-side mirror of `app.visibility_tier()`
// (supabase/migrations/0002_app_helpers.sql). This is a UX convenience ONLY:
// it lets the UI skip rendering/attempting a query it already knows would
// return nothing, avoiding empty-state flicker and wasted requests. It is
// NOT the security boundary -- RLS (0003_rls_policies.sql, composed from the
// same SQL function this mirrors) is the only real enforcement point (spec:
// network-authorization "Deny-by-Default Enforcement Point"). A malicious
// client can skip this file entirely; every query it would have blocked
// MUST still return zero rows from Postgres regardless of anything here.
//
// Zero Supabase import here on purpose (domain layer, hexagonal-lite split
// per design.md -- see identity-bridge/domain/session-claims.ts for the
// established pattern this file follows).

export type VisibilityTier = "owner" | "connected" | "candidate" | "none";

export interface VisibilityTierInput {
  readonly moduleEnabled: boolean;
  readonly hasNetworkAccess: boolean;
  readonly currentTenantId: string;
  readonly targetTenantId: string;
  readonly isConnected: boolean;
  readonly hasCandidateLink: boolean;
}

/**
 * Mirrors `app.visibility_tier()`'s decision order exactly:
 * 1. module disabled -> 'none' (cheapest fail, checked first everywhere)
 * 2. own tenant -> 'owner' (independent of the network-access grant)
 * 3. no network-access grant -> 'none' (no cross-tenant visibility at all)
 * 4. active connection edge -> 'connected'
 * 5. suggested/pending request link -> 'candidate'
 * 6. otherwise -> 'none'
 */
export function resolveVisibilityTier(input: VisibilityTierInput): VisibilityTier {
  if (!input.moduleEnabled) {
    return "none";
  }

  if (input.targetTenantId === input.currentTenantId) {
    return "owner";
  }

  if (!input.hasNetworkAccess) {
    return "none";
  }

  if (input.isConnected) {
    return "connected";
  }

  if (input.hasCandidateLink) {
    return "candidate";
  }

  return "none";
}

/** Convenience: is the target visible at all (any tier other than 'none')? */
export function canAccessTarget(tier: VisibilityTier): boolean {
  return tier !== "none";
}
