// Wraps TanStack Query's `useQuery` so a cross-tenant data-fetching query is
// never even attempted when the client already knows `tier === 'none'`.
//
// IMPORTANT -- UX convenience only, NOT the security boundary: this guard
// lives entirely in the browser. A malicious client can call
// `supabase.from(...).select()` directly, completely bypassing this hook --
// RLS (supabase/migrations/0003_rls_policies.sql, composed from
// `app.visibility_tier()`) is the ONLY real enforcement point and MUST deny
// that request independently of anything in this file (spec:
// network-authorization "Deny-by-Default Enforcement Point").
import { type UseQueryOptions, type UseQueryResult, useQuery } from "@tanstack/react-query";
import { canAccessTarget, type VisibilityTier } from "../domain/visibility-tier";

export function useGuardedQuery<TData>(
  tier: VisibilityTier,
  options: UseQueryOptions<TData>,
): UseQueryResult<TData> {
  return useQuery({
    ...options,
    enabled: canAccessTarget(tier) && (options.enabled ?? true),
  });
}
