// Pure rules for targeted-search's "Conseguir" flow (spec: Own-Inventory-First
// Search, Opt-In Fan-Out to Connected Tenants Only). Zero Supabase import on
// purpose (domain layer, hexagonal-lite split -- see
// network-connections/domain/connection-lifecycle.ts and
// tenant-directory/domain/visibility-rules.ts for the established pattern
// this file follows).

export type SearchMatchSource = "own_inventory" | "network";

export interface SearchMatchLike {
  readonly source: SearchMatchSource;
}

/**
 * Own-Inventory-First Search: "the own-inventory match is shown before any
 * network option is presented". A stable partition by source -- every
 * `own_inventory` match precedes every `network` match, relative order
 * preserved within each group. Does not mutate its input.
 */
export function orderMatchesOwnInventoryFirst<T extends SearchMatchLike>(
  matches: readonly T[],
): T[] {
  const own = matches.filter((match) => match.source === "own_inventory");
  const network = matches.filter((match) => match.source === "network");
  return [...own, ...network];
}

/**
 * Opt-In Fan-Out to Connected Tenants Only: "MUST restrict that fan-out to
 * tenants with an active mutual connection ... Unconnected tenants' vehicles
 * MUST NOT appear." This is the SAME invariant as network-connections'
 * `app.is_connected()` and this codebase's very first architecture
 * correction ("never platform-wide") -- mirrored here client-side as
 * defense-in-depth. The real enforcement point is
 * `insert_own_search_request_targets` (0003_rls_policies.sql), which
 * requires `app.is_connected(target_tenant_id)` server-side; this function
 * exists so the UI never even attempts to fan out to a tenant the server
 * would reject, and so the fan-out target list can be unit-tested without a
 * live Postgres round trip.
 */
export function filterConnectedFanOutTargets(
  candidateTenantIds: readonly string[],
  connectedTenantIds: readonly string[],
): string[] {
  const connected = new Set(connectedTenantIds);
  return candidateTenantIds.filter((tenantId) => connected.has(tenantId));
}
