// Wires identity-bridge's session hook (current tenant + module-enabled
// claim) together with the domain tier resolver, per design.md's
// hexagonal-lite split. Connection-state inputs (hasNetworkAccess,
// isConnected, hasCandidateLink) are NOT queried here -- Phase 3 only
// builds the reusable guard primitive; each consuming feature (e.g.
// tenant-directory, network-connections) resolves those from whatever
// connection-state query it already runs and passes the result in.
import { useSessionClaims } from "@/features/identity-bridge";
import { resolveVisibilityTier, type VisibilityTier } from "../domain/visibility-tier";

export interface UseVisibilityTierInput {
  readonly targetTenantId: string | undefined;
  readonly hasNetworkAccess: boolean;
  readonly isConnected: boolean;
  readonly hasCandidateLink: boolean;
}

/**
 * Client-side mirror of `app.visibility_tier()` for the current session's
 * tenant against a target tenant. UX-only -- see ../domain/visibility-tier.ts
 * for why this is never the real security boundary.
 */
export function useVisibilityTier(input: UseVisibilityTierInput): VisibilityTier {
  const { data } = useSessionClaims();

  if (data?.status !== "authenticated" || !input.targetTenantId) {
    return "none";
  }

  return resolveVisibilityTier({
    moduleEnabled: data.claims.redAliadosEnabled,
    hasNetworkAccess: input.hasNetworkAccess,
    currentTenantId: data.claims.tenantId,
    targetTenantId: input.targetTenantId,
    isConnected: input.isConnected,
    hasCandidateLink: input.hasCandidateLink,
  });
}
