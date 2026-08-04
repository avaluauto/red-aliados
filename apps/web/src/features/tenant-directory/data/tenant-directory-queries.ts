// Data adapter for tenant-directory (spec: One Contact Per Tenant,
// Reputation Visible Pre-Connection, Contact Reveal Gated by Acceptance).
// Reuses the single Supabase client instance from identity-bridge
// (data/supabase-client.ts's own top comment invites this) rather than
// constructing a new one -- domain/ stays pure, this is the only layer here
// allowed to talk to Supabase, per design.md's hexagonal-lite split.
import { supabaseClient } from "@/features/identity-bridge";
import type { VisibilityTier } from "@/features/network-authorization";
import { computeReputationScore, type ReputationEventInput } from "@/features/partner-reputation";

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
 *
 * The view is grained per VEHICLE, not per tenant -- a tenant with more
 * than one vehicle produces more than one row with identical
 * tenant_name/contact_phone/visibility_tier. `.limit(1)` (not
 * `.maybeSingle()`, which errors on >1 row and was silently swallowed here
 * to `null`, masking every multi-vehicle tenant's name/contact behind the
 * generic fallback) takes any one of them -- confirmed for real while
 * testing the accept-connection flow end-to-end against a two-vehicle test
 * tenant.
 */
export async function fetchTenantDirectoryEntry(
  targetTenantId: string,
): Promise<TenantDirectoryEntry | null> {
  const { data, error } = await supabaseClient
    .from("vehicle_snapshots_public")
    .select("tenant_id, tenant_name, contact_phone, visibility_tier")
    .eq("tenant_id", targetTenantId)
    .limit(1);

  const row = data?.[0];
  if (error || !row) {
    return null;
  }

  return {
    tenantId: row.tenant_id,
    tenantName: row.tenant_name,
    contactPhone: row.contact_phone,
    tier: row.visibility_tier,
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
// Reputation -- raw event counts + the Phase 7 computed score, additively
// =============================================================================

export interface ReputationSummary {
  readonly acceptedCount: number;
  readonly rejectedCount: number;
  readonly expiredCount: number;
  readonly totalCount: number;
  /**
   * Phase 7's weighted score (features/partner-reputation/domain:
   * computeReputationScore) -- `null` for a tenant with zero terminal events
   * yet ("unrated"), never a misleading 0. Added ADDITIVELY alongside the
   * pre-existing raw counts below (PR5's own forward-compat note on this
   * function: "can replace this function's body without changing its
   * callers' shape") -- every existing caller destructuring
   * acceptedCount/rejectedCount/expiredCount/totalCount is unaffected.
   */
  readonly score: number | null;
}

const EMPTY_SUMMARY: ReputationSummary = {
  acceptedCount: 0,
  rejectedCount: 0,
  expiredCount: 0,
  totalCount: 0,
  score: null,
};

/**
 * Reads `reputation_events` for `targetTenantId` and returns both the raw
 * per-outcome counts (pre-existing shape) and the Phase 7 weighted score
 * (features/partner-reputation/domain: computeReputationScore -- expiry
 * penalizes more than an explicit rejection, per partner-reputation spec).
 * One query, two derived views of the same rows -- no second round trip and
 * no duplicated Supabase call against features/partner-reputation's own data
 * layer, which is reserved for that feature's own hooks/components.
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
    .select("event_type, response_time_seconds")
    .eq("tenant_id", targetTenantId);

  if (error || !data) {
    return null;
  }

  const summary = { ...EMPTY_SUMMARY };
  const scoreInputs: ReputationEventInput[] = [];
  for (const row of data) {
    summary.totalCount += 1;
    scoreInputs.push({
      eventType: row.event_type as ReputationEventInput["eventType"],
      responseTimeSeconds: row.response_time_seconds as number,
    });
    if (row.event_type === "accepted") {
      summary.acceptedCount += 1;
    } else if (row.event_type === "rejected") {
      summary.rejectedCount += 1;
    } else if (row.event_type === "expired") {
      summary.expiredCount += 1;
    }
  }
  return { ...summary, score: computeReputationScore(scoreInputs).score };
}
