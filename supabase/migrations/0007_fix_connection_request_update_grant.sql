-- 0007_fix_connection_request_update_grant.sql
-- Corrective fix (post-merge-review, forged-edge exploit) for PR6
-- (0006_pg_cron_expire_requests.sql). See that file's SECURITY FIX note for
-- the full exploit writeup.
--
-- `authenticated` held an implicit table-wide UPDATE grant on
-- public.connection_requests (Supabase's default per-schema privileges,
-- applied at project bootstrap before any of this repo's migrations ever
-- run -- 0003_rls_policies.sql only ever narrowed `anon`'s blanket grant via
-- `revoke all on all tables in schema public from anon`, it never touched
-- `authenticated`'s). update_recipient_connection_request (0003) restricts
-- WHICH ROW the recipient tenant may touch, but a table-wide UPDATE grant
-- places no restriction on WHICH COLUMNS -- so a malicious recipient could
-- SET requester_tenant_id (or origin_type/vehicle_snapshot_id/
-- search_request_id/seeded_by) to retarget a request to an uninvolved
-- tenant, then accept it to forge a mutual connection_edges pair with zero
-- consent from the victim.
--
-- Fix: revoke the blanket UPDATE grant and re-grant it column-scoped to
-- exactly the two columns any legitimate client mutation ever touches
-- (status, responded_by -- see
-- apps/web/src/features/network-connections/data/connection-requests-queries.ts,
-- whose only write path is `updateConnectionRequestStatus`, which never
-- sets anything else). This is the PRIMARY fix layer: it turns
-- `UPDATE ... SET requester_tenant_id = ...` into a permission-denied error
-- at the grant level, before RLS or the trigger even run. 0006's trigger was
-- separately widened to also reject the same columns at the row level, as
-- defense in depth in case a future migration accidentally re-widens this
-- grant again.
--
-- This does NOT touch 0001-0005 (already merged / in other open PRs) --
-- only the grant, expressed as its own migration, per this PR's
-- one-new-file-per-concern constraint.
--
-- Verified for real against a disposable local Postgres 17 database
-- (Laragon, localhost:5432): pre-fix, `UPDATE connection_requests SET
-- requester_tenant_id = ... WHERE id = <own-recipient-row>` as `authenticated`
-- succeeded (UPDATE 1); post-fix (this migration applied), the identical
-- statement fails with `permission denied for table connection_requests`.
-- See supabase/tests/database/0006_connection_request_immutability.test.sql.

revoke update on public.connection_requests from authenticated;
grant update (status, responded_by) on public.connection_requests to authenticated;

comment on table public.connection_requests is
  'Double opt-in connection lifecycle: suggested -> pending -> accepted|rejected|expired. See network-connections spec. `authenticated` UPDATE is column-scoped to (status, responded_by) only (see this migration''s header) -- all other columns are additionally enforced immutable by the app.handle_connection_request_transition trigger (0006).';
