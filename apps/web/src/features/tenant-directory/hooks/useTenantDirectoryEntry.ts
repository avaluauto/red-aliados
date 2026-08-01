// Composes network-authorization's tier resolver + guarded query with this
// feature's own connection-state and directory/reputation queries, per
// design.md's hexagonal-lite split. Components never talk to ../data or
// ../domain directly (same convention as identity-bridge/network-authorization).
import {
  useGuardedQuery,
  useVisibilityTier,
  type VisibilityTier,
} from "@/features/network-authorization";
import {
  fetchReputationSummary,
  fetchTenantDirectoryEntry,
  type ReputationSummary,
  type TenantDirectoryEntry,
} from "../data/tenant-directory-queries";
import { isContactRevealed, isReputationVisible } from "../domain/visibility-rules";
import { useConnectionState } from "./useConnectionState";

export interface TenantDirectoryEntryResult {
  readonly tier: VisibilityTier;
  readonly contactRevealed: boolean;
  readonly reputationVisible: boolean;
  readonly entry: TenantDirectoryEntry | null;
  readonly reputation: ReputationSummary | null;
  readonly isLoading: boolean;
}

/**
 * A single tenant's directory entry, tier-gated per tenant-directory spec.
 * Both the entry query (vehicle_snapshots_public) and the reputation query
 * (reputation_events) are wrapped in useGuardedQuery -- tier === 'none'
 * means neither is even attempted, mirroring network-authorization's UX
 * convenience guard (RLS on both tables is the real enforcement point).
 */
export function useTenantDirectoryEntry(
  targetTenantId: string | undefined,
): TenantDirectoryEntryResult {
  const connectionState = useConnectionState(targetTenantId);

  const tier = useVisibilityTier({
    targetTenantId,
    hasNetworkAccess: connectionState.hasNetworkAccess,
    isConnected: connectionState.isConnected,
    hasCandidateLink: connectionState.hasCandidateLink,
  });

  const entryQuery = useGuardedQuery(tier, {
    queryKey: ["tenant-directory", "entry", targetTenantId],
    queryFn: () => fetchTenantDirectoryEntry(targetTenantId as string),
    enabled: Boolean(targetTenantId),
  });

  const reputationQuery = useGuardedQuery(tier, {
    queryKey: ["tenant-directory", "reputation", targetTenantId],
    queryFn: () => fetchReputationSummary(targetTenantId as string),
    enabled: Boolean(targetTenantId),
  });

  return {
    tier,
    contactRevealed: isContactRevealed(tier),
    reputationVisible: isReputationVisible(tier),
    entry: entryQuery.data ?? null,
    reputation: reputationQuery.data ?? null,
    isLoading: connectionState.isLoading || entryQuery.isPending,
  };
}
