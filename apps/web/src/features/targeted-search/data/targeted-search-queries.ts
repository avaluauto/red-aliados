// Data adapter for targeted-search / "Conseguir" (spec: Own-Inventory-First
// Search, Opt-In Fan-Out to Connected Tenants Only, No Auto-Share; Explicit
// Proceed Fires Opportunity Event). Reuses the single Supabase client
// instance from identity-bridge (same convention every other feature's
// data/ adapter follows) -- domain/ stays pure, this is the only layer here
// allowed to talk to Supabase, per design.md's hexagonal-lite split.
//
// Convention split vs. every other feature's own adapter: READ functions
// (fetchOwnInventoryVehicles, fetchConnectedTenantIds, fetchFanOutMatches)
// swallow errors to an empty array -- a failed read degrades to "nothing
// visible yet", never a crash. WRITE functions (createSearchRequest,
// optInToFanOut, respondWithMatch, proceedOnMatch) THROW on error instead,
// because a TanStack `useMutation` needs a real error to react to (e.g. an
// RLS denial must surface, not be swallowed as if it had succeeded).
//
// IMPORTANT SCOPE BOUNDARY (targeted-search: No Auto-Share; Explicit Proceed
// Fires Opportunity Event): `proceedOnMatch` inserts a
// `search_opportunities_out` ROW -- the local event this module produces.
// It does NOT and CANNOT create an actual V2 CRM Opportunity: there is no
// live V2 system in this sandbox to integrate with. A future integration
// (out of this module's scope) would consume `search_opportunities_out`
// rows (e.g. via a webhook/outbox reader, mirroring how vehicle-sync
// consumes V2's own outbox in the opposite direction) and stamp
// `v2_opportunity_ref` once V2 confirms creation.
import type { Json, Tables, TablesUpdate, Views } from "@red-aliados/contracts/db";
import { supabaseClient } from "@/features/identity-bridge";
import { createConnectionRequest } from "@/features/network-connections";

export type SearchRequestRow = Tables<"search_requests">;
export type SearchRequestTargetRow = Tables<"search_request_targets">;
export type FanOutMatchRow = Tables<"connection_requests">;
export type SearchOpportunityRow = Tables<"search_opportunities_out">;
export type VehicleSnapshotPublicRow = Pick<
  Views<"vehicle_snapshots_public">,
  "id" | "tenant_id" | "make" | "model" | "year" | "ally_price" | "status" | "views_count"
>;

export interface CreateSearchRequestInput {
  readonly tenantId: string;
  readonly requestedBy: string;
  readonly criteria: Record<string, Json>;
}

/**
 * Registers a Conseguir sourcing request. Own-inventory search (below)
 * always runs against this request's own tenant first, independent of any
 * fan-out opt-in (`opted_in_fan_out` defaults to `false` via the table's
 * own column default, 0001_core_schema.sql).
 */
export async function createSearchRequest(
  input: CreateSearchRequestInput,
): Promise<SearchRequestRow> {
  const { data, error } = await supabaseClient
    .from("search_requests")
    .insert({
      tenant_id: input.tenantId,
      requested_by: input.requestedBy,
      criteria: input.criteria,
    })
    .select()
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "failed to create search request");
  }
  return data;
}

/**
 * Reads the tenant's own `search_requests` rows (most recent first) -- the
 * listing read this module was previously missing: createSearchRequest only
 * returns the single row it just inserted, and fetchFanOutMatches/
 * fetchOwnInventoryVehicles both need a specific request id already in hand.
 * `select_own_tenant_search_requests` (0003_rls_policies.sql) already scopes
 * visible rows to `tenant_id = app.current_tenant_id()`; this function adds
 * no new RLS surface. Follows the same READ convention as
 * fetchOwnInventoryVehicles/fetchConnectedTenantIds/fetchFanOutMatches above
 * -- swallows errors to an empty array, never throws.
 */
export async function fetchOwnSearchRequests(tenantId: string): Promise<SearchRequestRow[]> {
  const { data, error } = await supabaseClient
    .from("search_requests")
    .select()
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });

  if (error || !data) {
    return [];
  }
  return data;
}

/**
 * Own-Inventory-First Search: reads the requesting tenant's own vehicles
 * through `vehicle_snapshots_public` (0004_public_views.sql) -- the ONE read
 * path for vehicle inventory in this codebase, never the base
 * `vehicle_snapshots` table directly (same convention
 * tenant-directory-queries.ts's fetchTenantDirectoryEntry established). At
 * the caller's own tenant, `visibility_tier` resolves to `'owner'`, so no
 * column is masked.
 */
export async function fetchOwnInventoryVehicles(
  tenantId: string,
): Promise<VehicleSnapshotPublicRow[]> {
  const { data, error } = await supabaseClient
    .from("vehicle_snapshots_public")
    .select("id, tenant_id, make, model, year, ally_price, status, views_count")
    .eq("tenant_id", tenantId);

  if (error || !data) {
    return [];
  }
  return data as unknown as VehicleSnapshotPublicRow[];
}

/**
 * Opt-In Fan-Out to Connected Tenants Only: reads the caller's own active
 * `connection_edges` rows -- the SAME table and RLS-scoped read pattern
 * network-connections/tenant-directory already use
 * (select_own_connection_edges, 0003_rls_policies.sql) -- rather than
 * reinventing a parallel "who am I connected to" query. This is the ONLY
 * source of truth this module consults before ever fanning out; a candidate
 * tenant absent from this list can never become a fan-out target (see
 * domain/search-matching.ts's filterConnectedFanOutTargets).
 */
export async function fetchConnectedTenantIds(): Promise<string[]> {
  const { data, error } = await supabaseClient
    .from("connection_edges")
    .select("visible_tenant_id")
    .is("revoked_at", null);

  if (error || !data) {
    return [];
  }
  return data.map((row) => row.visible_tenant_id);
}

export interface OptInToFanOutResult {
  readonly searchRequest: SearchRequestRow;
  readonly targets: SearchRequestTargetRow[];
}

/**
 * Opt-In Fan-Out to Connected Tenants Only: marks the search_requests row as
 * opted in, then inserts one search_request_targets row per tenant in
 * `connectedTenantIds`. This function trusts its caller to have already
 * narrowed that list to actually-connected tenants (hooks/useOptInFanOut.ts
 * does so via fetchConnectedTenantIds + domain's
 * filterConnectedFanOutTargets) -- the REAL enforcement point is still
 * `insert_own_search_request_targets` (0003_rls_policies.sql), whose
 * `and app.is_connected(target_tenant_id)` check would reject any row for a
 * tenant that slipped through unconnected. An empty target list still marks
 * the request opted-in (a tenant may opt in before having any connections
 * yet) but inserts nothing.
 */
export async function optInToFanOut(
  searchRequestId: string,
  connectedTenantIds: readonly string[],
): Promise<OptInToFanOutResult> {
  const patch: TablesUpdate<"search_requests"> = {
    opted_in_fan_out: true,
    opted_in_at: new Date().toISOString(),
  };

  const { data: searchRequest, error: updateError } = await supabaseClient
    .from("search_requests")
    .update(patch)
    .eq("id", searchRequestId)
    .select()
    .single();

  if (updateError || !searchRequest) {
    throw new Error(updateError?.message ?? "failed to opt in to network fan-out");
  }

  if (connectedTenantIds.length === 0) {
    return { searchRequest, targets: [] };
  }

  const { data: targets, error: insertError } = await supabaseClient
    .from("search_request_targets")
    .insert(
      connectedTenantIds.map((targetTenantId) => ({
        search_request_id: searchRequestId,
        target_tenant_id: targetTenantId,
      })),
    )
    .select();

  if (insertError || !targets) {
    throw new Error(insertError?.message ?? "failed to create fan-out targets");
  }

  return { searchRequest, targets };
}

/**
 * Reads `search_match`-origin connection_requests rows linked to this
 * search request -- each one is a target tenant's "tengo algo similar"
 * response (see respondWithMatch below). `select_own_connection_requests`
 * (0003) already scopes visible rows to the caller's own tenant as
 * requester or recipient; the original searcher is always the recipient of
 * these rows (see respondWithMatch), so this naturally returns only matches
 * addressed to the caller.
 */
export async function fetchFanOutMatches(searchRequestId: string): Promise<FanOutMatchRow[]> {
  const { data, error } = await supabaseClient
    .from("connection_requests")
    .select()
    .eq("search_request_id", searchRequestId)
    .eq("origin_type", "search_match");

  if (error || !data) {
    return [];
  }
  return data;
}

export interface RespondWithMatchInput {
  readonly searchRequestId: string;
  /** The tenant that has a similar vehicle to offer -- becomes the connection_requests requester. */
  readonly matchOwnerTenantId: string;
  /** The tenant who registered the search_requests row -- becomes the connection_requests recipient. */
  readonly originalRequesterTenantId: string;
  readonly matchOwnerUserId: string;
  readonly vehicleSnapshotId: string;
}

/**
 * "Tengo algo similar": a connected target tenant signals it has a matching
 * vehicle by creating a `search_match`-origin connection_requests row,
 * itself as requester, the original searcher as recipient. Reuses
 * network-connections' `createConnectionRequest` rather than reinventing an
 * insert -- same additive-composition pattern connection-messaging
 * established when it reused network-connections' `ConnectionRequestStatus`
 * type. `insert_own_request` (0003_rls_policies.sql) already enforces
 * `requester_tenant_id = app.current_tenant_id()` and
 * `origin_type in ('vehicle_interest','search_match')` -- this function adds
 * no new RLS surface.
 */
export async function respondWithMatch(input: RespondWithMatchInput): Promise<FanOutMatchRow> {
  return createConnectionRequest({
    requesterTenantId: input.matchOwnerTenantId,
    recipientTenantId: input.originalRequesterTenantId,
    originType: "search_match",
    requestedBy: input.matchOwnerUserId,
    vehicleSnapshotId: input.vehicleSnapshotId,
    searchRequestId: input.searchRequestId,
  });
}

export interface ProceedOnMatchInput {
  readonly searchRequestId: string;
  readonly vehicleSnapshotId: string;
  readonly matchedTenantId: string;
  readonly proceededBy: string;
}

/**
 * No Auto-Share; Explicit Proceed Fires Opportunity Event: inserts a
 * `search_opportunities_out` row -- the ONLY thing this module does to
 * "fire" a V2 Opportunity. There is no live V2 CRM in this sandbox; this
 * row IS the event/trigger a future integration would consume. Red Aliados
 * itself tracks no further pipeline state (see this file's own top
 * comment). `insert_own_search_opportunity_out` (0003) requires
 * `proceeded_by = auth.uid()`, the search request to belong to the caller's
 * tenant, and `app.visibility_tier(matched_tenant_id) <> 'none'` -- i.e. the
 * requester can already see the matched tenant (own inventory or an active
 * connection), never an arbitrary unconnected one.
 */
export async function proceedOnMatch(input: ProceedOnMatchInput): Promise<SearchOpportunityRow> {
  const { data, error } = await supabaseClient
    .from("search_opportunities_out")
    .insert({
      search_request_id: input.searchRequestId,
      vehicle_snapshot_id: input.vehicleSnapshotId,
      matched_tenant_id: input.matchedTenantId,
      proceeded_by: input.proceededBy,
    })
    .select()
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "failed to proceed on match");
  }
  return data;
}
