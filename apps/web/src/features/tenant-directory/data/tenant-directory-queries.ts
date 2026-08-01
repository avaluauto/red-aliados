// Data adapter for tenant-directory (spec: One Contact Per Tenant,
// Reputation Visible Pre-Connection, Contact Reveal Gated by Acceptance).
// Reuses the single Supabase client instance from identity-bridge
// (data/supabase-client.ts's own top comment invites this) rather than
// constructing a new one -- domain/ stays pure, this is the only layer here
// allowed to talk to Supabase, per design.md's hexagonal-lite split.
import { supabaseClient } from "@/features/identity-bridge";
import type { VisibilityTier } from "@/features/network-authorization";

export interface TenantDirectoryEntry {
  readonly tenantId: string;
  readonly tenantName: string | null;
  readonly contactPhone: string | null;
  readonly tier: VisibilityTier;
}

/**
 * Reads a single tenant's directory entry through `vehicle_snapshots_public`
 * (0004_public_views.sql) -- the ONE read path for vehicle inventory, never
 * the base `tenants`/`tenant_contacts` tables (their SELECT grant is
 * revoked from `authenticated`). The view already row-filters
 * (`visibility_tier <> 'none'`) and column-masks `tenant_name`/
 * `contact_phone` below the `connected` tier, so a `candidate`-tier row
 * comes back with both fields already null -- this function does not
 * re-derive that masking, only maps the row shape.
 */
export async function fetchTenantDirectoryEntry(
  targetTenantId: string,
): Promise<TenantDirectoryEntry | null> {
  const { data, error } = await supabaseClient
    .from("vehicle_snapshots_public")
    .select("tenant_id, tenant_name, contact_phone, visibility_tier")
    .eq("tenant_id", targetTenantId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return {
    tenantId: data.tenant_id,
    tenantName: data.tenant_name,
    contactPhone: data.contact_phone,
    tier: data.visibility_tier,
  };
}

// =============================================================================
// Connection-state queries -- network-authorization's useVisibilityTier
// takes hasNetworkAccess/isConnected/hasCandidateLink as caller-supplied
// inputs ("each consuming feature resolves those booleans itself", see
// features/network-authorization/hooks/useVisibilityTier.ts). Each query
// below is scoped by its own table's RLS policy (0003_rls_policies.sql) to
// rows the caller's own tenant already may see -- select_own_access_grant,
// select_own_connection_edges, select_own_connection_requests -- so it is
// safe to run unconditionally; there is no cross-tenant leak risk in
// computing the tier itself. Each one mirrors the exact SQL predicate its
// matching app.* helper (0002_app_helpers.sql) uses server-side.
// =============================================================================

/** Mirrors app.has_network_access(): a granted, non-revoked access row for the caller. */
export async function fetchHasNetworkAccess(): Promise<boolean> {
  const { data, error } = await supabaseClient
    .from("tenant_users_access")
    .select("id")
    .eq("granted", true)
    .is("revoked_at", null);

  if (error || !data) {
    return false;
  }

  return data.length > 0;
}

/** Mirrors app.is_connected(): an active connection_edges row to targetTenantId. */
export async function fetchIsConnected(targetTenantId: string): Promise<boolean> {
  const { data, error } = await supabaseClient
    .from("connection_edges")
    .select("id")
    .eq("visible_tenant_id", targetTenantId)
    .is("revoked_at", null);

  if (error || !data) {
    return false;
  }

  return data.length > 0;
}

/**
 * Mirrors app.has_candidate_link(): a suggested/pending connection_requests
 * row linking the caller's tenant and targetTenantId, in either direction.
 * RLS already restricts visible rows to ones where the caller is requester
 * or recipient; the `.or()` below adds the other half of the predicate --
 * that targetTenantId is the OTHER party.
 */
export async function fetchHasCandidateLink(targetTenantId: string): Promise<boolean> {
  const { data, error } = await supabaseClient
    .from("connection_requests")
    .select("id")
    .in("status", ["suggested", "pending"])
    .or(`requester_tenant_id.eq.${targetTenantId},recipient_tenant_id.eq.${targetTenantId}`);

  if (error || !data) {
    return false;
  }

  return data.length > 0;
}

// =============================================================================
// Reputation -- raw event-count summary, NOT the computed score
// =============================================================================

export interface ReputationSummary {
  readonly acceptedCount: number;
  readonly rejectedCount: number;
  readonly expiredCount: number;
  readonly totalCount: number;
}

const EMPTY_SUMMARY: ReputationSummary = {
  acceptedCount: 0,
  rejectedCount: 0,
  expiredCount: 0,
  totalCount: 0,
};

/**
 * DEVIATION / SCOPE BOUNDARY (documented, not silently resolved): this is a
 * RAW COUNT summary of `reputation_events` rows, not the weighted "computed
 * reputation score" partner-reputation.md describes (response-time
 * weighting, expiry-penalizes-more-than-rejection). That scoring algorithm
 * is Phase 7's domain to build (see tasks.md 7.1). Task 5.3 only needs a
 * visibility-gated slot on the candidate card to show *something*
 * reputation-shaped pre-connection; this function supplies that without
 * pre-empting Phase 7's real computation, which can replace this function's
 * body without changing its callers' shape.
 *
 * Query itself is real and RLS-gated for real: reputation_events'
 * select_reputation_events policy (0003) already permits reads for the
 * caller's own tenant or a candidate/connected target -- see
 * app.visibility_tier()'s composed layers.
 */
export async function fetchReputationSummary(
  targetTenantId: string,
): Promise<ReputationSummary | null> {
  const { data, error } = await supabaseClient
    .from("reputation_events")
    .select("event_type")
    .eq("tenant_id", targetTenantId);

  if (error || !data) {
    return null;
  }

  const summary = { ...EMPTY_SUMMARY };
  for (const row of data) {
    summary.totalCount += 1;
    if (row.event_type === "accepted") {
      summary.acceptedCount += 1;
    } else if (row.event_type === "rejected") {
      summary.rejectedCount += 1;
    } else if (row.event_type === "expired") {
      summary.expiredCount += 1;
    }
  }
  return summary;
}
