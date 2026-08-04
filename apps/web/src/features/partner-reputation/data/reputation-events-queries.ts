// Data adapter for partner-reputation (spec: Response Events Recorded, Score
// Computation and Expiry Penalty). Reuses the single Supabase client
// instance from identity-bridge, same convention every other feature's data
// adapter follows -- domain/ stays pure, this is the only layer here allowed
// to talk to Supabase, per design.md's hexagonal-lite split.
//
// Read-only, error-swallowing convention (same as tenant-directory-queries.ts):
// a failed/denied read degrades to null ("treat as unrated"), never a crash
// -- there is no write path here at all (spec: "Score is read-only"; the
// only writer is the DB trigger, supabase/migrations/0008_reputation_events_trigger.sql).
import { supabaseClient } from "@/features/identity-bridge";
import type { ReputationEventInput } from "../domain/reputation-score";

/**
 * Reads every terminal `reputation_events` row recorded for `tenantId`.
 * RLS's `select_reputation_events` policy (0003_rls_policies.sql) already
 * scopes this to rows the caller may see (own tenant, or a
 * candidate/connected target) -- this function does not re-derive that
 * visibility rule, only maps the row shape into the domain layer's input
 * type.
 */
export async function fetchReputationEvents(
  tenantId: string,
): Promise<ReputationEventInput[] | null> {
  const { data, error } = await supabaseClient
    .from("reputation_events")
    .select("event_type, response_time_seconds")
    .eq("tenant_id", tenantId);

  if (error || !data) {
    return null;
  }

  return data.map((row) => ({
    eventType: row.event_type as ReputationEventInput["eventType"],
    responseTimeSeconds: row.response_time_seconds as number,
  }));
}
