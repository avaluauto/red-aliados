// Resolves the three connection-state booleans useVisibilityTier needs for a
// given target tenant, per network-authorization's own note: "each
// consuming feature resolves those booleans itself" (see
// features/network-authorization/hooks/useVisibilityTier.ts). Each query is
// scoped by its own table's RLS policy (0003_rls_policies.sql) to rows the
// caller's own tenant already may see, so it is safe to run unconditionally
// -- there is no cross-tenant leak risk in computing the tier itself.
import { useQuery } from "@tanstack/react-query";
import {
  fetchHasCandidateLink,
  fetchHasNetworkAccess,
  fetchIsConnected,
} from "../data/tenant-directory-queries";

export interface ConnectionState {
  readonly hasNetworkAccess: boolean;
  readonly isConnected: boolean;
  readonly hasCandidateLink: boolean;
  readonly isLoading: boolean;
}

export function useConnectionState(targetTenantId: string | undefined): ConnectionState {
  const enabled = Boolean(targetTenantId);

  const hasNetworkAccessQuery = useQuery({
    queryKey: ["tenant-directory", "has-network-access"],
    queryFn: fetchHasNetworkAccess,
    enabled,
  });

  const isConnectedQuery = useQuery({
    queryKey: ["tenant-directory", "is-connected", targetTenantId],
    queryFn: () => fetchIsConnected(targetTenantId as string),
    enabled,
  });

  const hasCandidateLinkQuery = useQuery({
    queryKey: ["tenant-directory", "has-candidate-link", targetTenantId],
    queryFn: () => fetchHasCandidateLink(targetTenantId as string),
    enabled,
  });

  return {
    hasNetworkAccess: hasNetworkAccessQuery.data ?? false,
    isConnected: isConnectedQuery.data ?? false,
    hasCandidateLink: hasCandidateLinkQuery.data ?? false,
    isLoading:
      enabled &&
      (hasNetworkAccessQuery.isPending ||
        isConnectedQuery.isPending ||
        hasCandidateLinkQuery.isPending),
  };
}
