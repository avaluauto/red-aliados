// Data adapter for network-connections (spec: Connection Request Origins,
// Suggested Status for Seeded Requests, 48-Hour Expiry with Double Opt-In).
// Reuses the single Supabase client instance from identity-bridge (same
// convention tenant-directory's data adapter established) -- domain/ stays
// pure, this is the only layer here allowed to talk to Supabase, per
// design.md's hexagonal-lite split.
//
// Convention split vs. tenant-directory's read-only adapter: READ functions
// here (fetchConnectionEdgesForRequest) swallow errors to an empty array,
// exactly like every fetch* function in tenant-directory-queries.ts -- a
// failed read degrades to "nothing visible yet", never a crash. WRITE
// functions (create/act/accept/reject) THROW on error instead, because a
// TanStack `useMutation` needs a real error to react to (`onError`,
// `isError`) -- silently returning null would hide a rejected mutation
// (e.g. an RLS denial) as if it had succeeded.

import type { Tables } from "@red-aliados/contracts/db";
import { supabaseClient } from "@/features/identity-bridge";
import type { ClientCreatableOriginType } from "../domain/connection-lifecycle";

export type ConnectionRequestRow = Tables<"connection_requests">;
export type ConnectionEdgeRow = Tables<"connection_edges">;

export interface CreateConnectionRequestInput {
  readonly requesterTenantId: string;
  readonly recipientTenantId: string;
  /**
   * Never `direct` -- see ClientCreatableOriginType's own comment. The
   * `insert_own_request` RLS policy (0003_rls_policies.sql) enforces this
   * server-side too; this type just keeps the client from offering a control
   * that could never succeed.
   */
  readonly originType: ClientCreatableOriginType;
  readonly requestedBy: string;
  readonly vehicleSnapshotId?: string;
  readonly searchRequestId?: string;
}

/**
 * Creates a `vehicle_interest`/`search_match`-origin connection_requests row
 * (network-connections: Connection Request Origins). Defaults to
 * `status = 'pending'` via the table's own column default (0001_core_schema.sql)
 * -- a client-initiated request is never `suggested` (that status is
 * reserved for operator-seeded rows, which this function cannot create at
 * all: RLS's insert_own_request policy has no path for origin_type='direct').
 */
export async function createConnectionRequest(
  input: CreateConnectionRequestInput,
): Promise<ConnectionRequestRow> {
  const { data, error } = await supabaseClient
    .from("connection_requests")
    .insert({
      requester_tenant_id: input.requesterTenantId,
      recipient_tenant_id: input.recipientTenantId,
      origin_type: input.originType,
      requested_by: input.requestedBy,
      vehicle_snapshot_id: input.vehicleSnapshotId ?? null,
      search_request_id: input.searchRequestId ?? null,
    })
    .select()
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "failed to create connection request");
  }
  return data;
}

/**
 * Promotes a `suggested` request to `pending` (network-connections:
 * "Recipient acts on a suggestion"). Deliberately does NOT send `expires_at`
 * -- the Postgres trigger (app.handle_connection_request_transition, see
 * supabase/migrations/0006_pg_cron_expire_requests.sql) computes and stamps
 * `now() + 48 hours` itself, the same way `computeExpiresAt` mirrors it
 * client-side for UX only. The client's own clock is never trusted for this.
 */
export async function actOnSuggestedRequest(requestId: string): Promise<ConnectionRequestRow> {
  return updateConnectionRequestStatus(requestId, { status: "pending" });
}

/**
 * Accepts a pending request. Reciprocal `connection_edges` rows for both
 * tenants are created server-side by the same trigger, not by this
 * function -- see 0006's file header ("written by trigger/service-role
 * logic ... never directly by an authenticated client", design.md).
 */
export async function acceptConnectionRequest(
  requestId: string,
  respondedBy: string,
): Promise<ConnectionRequestRow> {
  return updateConnectionRequestStatus(requestId, {
    status: "accepted",
    responded_by: respondedBy,
  });
}

/** Rejects a pending request. No connection_edges rows are created. */
export async function rejectConnectionRequest(
  requestId: string,
  respondedBy: string,
): Promise<ConnectionRequestRow> {
  return updateConnectionRequestStatus(requestId, {
    status: "rejected",
    responded_by: respondedBy,
  });
}

async function updateConnectionRequestStatus(
  requestId: string,
  patch: { status: "pending" | "accepted" | "rejected"; responded_by?: string },
): Promise<ConnectionRequestRow> {
  const { data, error } = await supabaseClient
    .from("connection_requests")
    .update(patch)
    .eq("id", requestId)
    .select()
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "failed to update connection request");
  }
  return data;
}

/**
 * Reads the reciprocal `connection_edges` rows for a given
 * connection_request -- populated by the acceptance trigger (0006), empty
 * for a request that is still pending/suggested or was rejected/expired.
 * RLS's `select_own_connection_edges` policy (0003) already scopes this to
 * rows viewable by the caller's own tenant.
 */
export async function fetchConnectionEdgesForRequest(
  requestId: string,
): Promise<ConnectionEdgeRow[]> {
  const { data, error } = await supabaseClient
    .from("connection_edges")
    .select()
    .eq("connection_request_id", requestId);

  if (error || !data) {
    return [];
  }
  return data;
}
