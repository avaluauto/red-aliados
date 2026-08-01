-- 0006_pg_cron_expire_requests.sql
-- Phase 6 (PR6): network-connections' state-machine enforcement + the
-- pg_cron auto-expiry sweep (spec: 48-Hour Expiry with Double Opt-In,
-- Suggested Status for Seeded Requests). Per apply-progress's PR6 workload
-- constraint, only ONE new migration file was authorized for this PR (do not
-- hand-edit 0001-0005) -- so this file groups two closely related Phase 6
-- concerns instead of splitting them across migrations that don't exist yet:
--
--   PART A: app.handle_connection_request_transition() -- a BEFORE UPDATE
--           trigger on connection_requests that (1) rejects any change to
--           the request's identity columns (requester_tenant_id,
--           origin_type, vehicle_snapshot_id, search_request_id,
--           seeded_by) after row creation, (2) validates every status
--           transition against the state machine (suggested -> pending ->
--           accepted|rejected|expired), rejecting anything else, and
--           (3) on transition into 'accepted', inserts the two reciprocal
--           connection_edges rows. This is the "trigger/service-role logic"
--           design.md names as the actual writer of connection_edges (0003's
--           own comment: "written by trigger/service-role logic ... never
--           directly by an authenticated client") -- 0003 deliberately has
--           no INSERT policy on connection_edges for `authenticated`, so a
--           SECURITY DEFINER trigger is the only path.
--
--   PART B: pg_cron job auto-expiring `pending` rows past `expires_at`,
--           reusing the same trigger (an UPDATE into 'expired' still passes
--           through PART A's transition validation) so there is exactly one
--           enforcement point for what counts as a legal status change,
--           whether a human or a scheduled job makes it.
--
-- SECURITY FIX (post-merge-review, forged-edge exploit): the trigger
-- originally only fired `when (old.status is distinct from new.status)`.
-- Because 0003's update_recipient_connection_request RLS policy restricts
-- WHICH ROW the recipient may touch (recipient_tenant_id = current tenant)
-- but not WHICH COLUMNS, and `authenticated` held an implicit table-wide
-- UPDATE grant (Supabase's default per-schema privileges, applied at project
-- bootstrap -- never narrowed by 0003 the way `revoke all ... from anon` was),
-- a malicious recipient B could: (1) UPDATE requester_tenant_id on an inbound
-- pending request to an arbitrary victim tenant Z with status left UNCHANGED
-- -- the narrow WHEN clause meant this fired no validation at all -- then
-- (2) UPDATE status = 'accepted', which used old.requester_tenant_id (now Z)
-- to insert reciprocal connection_edges for (Z,B) and (B,Z), forging a live
-- mutual connection with zero consent from Z and zero involvement from the
-- real requester A. Fixed with defense in depth, both layers required:
--   1. 0007_fix_connection_request_update_grant.sql narrows the table-wide
--      UPDATE grant to authenticated down to (status, responded_by) only --
--      the only columns any legitimate client mutation ever touches (see
--      connection-requests-queries.ts). This is the primary fix: it makes
--      `UPDATE ... SET requester_tenant_id = ...` a permission-denied error
--      before the trigger even runs.
--   2. This trigger now fires unconditionally (`for each row`, no WHEN
--      restriction) and its first act is an explicit immutability check on
--      requester_tenant_id/origin_type/vehicle_snapshot_id/search_request_id/
--      seeded_by, independent of any grant. This holds even if a future
--      migration accidentally re-widens the grant -- belt and suspenders,
--      not either/or.
-- Verified for real against a disposable local Postgres 17 database
-- (Laragon, localhost:5432) with a hand-rolled stand-in for the roles/
-- auth.jwt()/auth.uid() the real Supabase platform bootstrap normally
-- provides: pre-fix, the two-step exploit above produced forged
-- connection_edges rows between B and an uninvolved tenant Z; post-fix
-- (0007 applied + this widened trigger), step (1) is rejected with
-- `permission denied for table connection_requests` before the trigger
-- (and thus the immutability check) is even reached. See
-- supabase/tests/database/0006_connection_request_immutability.test.sql
-- for the pgTAP-shaped regression assertion.
--
-- PART B (pg_cron scheduling) remains NOT EXECUTED (same documented gap as
-- 0005_pg_cron_reconcile.sql): no Docker/Supabase CLI and no pg_cron
-- extension binary are available in this sandbox's local Postgres 17
-- install. Verify by running `supabase db reset` (or `supabase start` +
-- `supabase migration up`) against a real Supabase CLI project once
-- available, then `select * from cron.job;` to confirm the schedule
-- registered.

-- =============================================================================
-- PART A: state-machine enforcement + reciprocal edge creation on acceptance
-- =============================================================================

create or replace function app.handle_connection_request_transition()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Identity columns are immutable after row creation, regardless of
  -- whether status changes in the same UPDATE (see SECURITY FIX note above
  -- -- this closes the forged-edge exploit even if 0007's column-scoped
  -- GRANT is ever accidentally re-widened). This check runs unconditionally
  -- because the trigger itself now fires on every UPDATE, not just ones
  -- that change status.
  if new.requester_tenant_id is distinct from old.requester_tenant_id
    or new.origin_type is distinct from old.origin_type
    or new.vehicle_snapshot_id is distinct from old.vehicle_snapshot_id
    or new.search_request_id is distinct from old.search_request_id
    or new.seeded_by is distinct from old.seeded_by
  then
    raise exception
      'connection_requests identity columns (requester_tenant_id, origin_type, vehicle_snapshot_id, search_request_id, seeded_by) are immutable after row creation (request %)',
      old.id;
  end if;

  -- No-op status updates (e.g. touching only responded_by) never re-validate
  -- the state machine or re-fire edge creation.
  if new.status = old.status then
    return new;
  end if;

  if old.status = 'suggested' and new.status = 'pending' then
    -- Suggested Status for Seeded Requests: "acting on a suggestion"
    -- transitions to pending with expires_at = now() + 48h. The client
    -- NEVER supplies this value (see actOnSuggestedRequest in
    -- apps/web/src/features/network-connections/data/connection-requests-queries.ts)
    -- -- it is always computed here, not trusted from the caller.
    new.expires_at := now() + interval '48 hours';
    new.responded_at := null;

  elsif old.status = 'pending' and new.status in ('accepted', 'rejected', 'expired') then
    -- 48-Hour Expiry with Double Opt-In: every terminal outcome is stamped
    -- with a responded_at if the caller did not already provide one (the
    -- pg_cron sweep in PART B does not set responded_by/responded_at itself,
    -- so this ensures the row still records *when* it became terminal).
    new.responded_at := coalesce(new.responded_at, now());

  else
    raise exception
      'invalid connection_requests status transition: % -> % (request %)',
      old.status, new.status, old.id;
  end if;

  if new.status = 'accepted' then
    -- Accepted within window: reciprocal connection_edges rows are created
    -- for BOTH tenants. old.id = new.id (this is an UPDATE, not an INSERT),
    -- so the FK target already exists regardless of BEFORE/AFTER timing.
    -- ON CONFLICT guards a retried/duplicate transition attempt against the
    -- partial unique index (0001: connection_edges_viewer_visible_active_idx).
    insert into public.connection_edges (viewer_tenant_id, visible_tenant_id, connection_request_id)
    values
      (old.requester_tenant_id, old.recipient_tenant_id, old.id),
      (old.recipient_tenant_id, old.requester_tenant_id, old.id)
    on conflict (viewer_tenant_id, visible_tenant_id) where revoked_at is null
    do nothing;
  end if;

  return new;
end;
$$;

comment on function app.handle_connection_request_transition() is
  'BEFORE UPDATE trigger on connection_requests: rejects any change to the identity columns (requester_tenant_id, origin_type, vehicle_snapshot_id, search_request_id, seeded_by) regardless of status, enforces the suggested->pending->accepted|rejected|expired state machine (raises on any other status transition), and, on transition into accepted, inserts the two reciprocal connection_edges rows. Fires unconditionally (no WHEN clause) -- see SECURITY FIX note above -- so the immutability check runs even on a no-op-status UPDATE. SECURITY DEFINER because connection_edges has no INSERT policy for authenticated (0003) -- this trigger is the only writer, per design.md.';

drop trigger if exists handle_connection_request_transition on public.connection_requests;

create trigger handle_connection_request_transition
  before update on public.connection_requests
  for each row
  execute function app.handle_connection_request_transition();

-- =============================================================================
-- PART B: pg_cron auto-expiry sweep
-- =============================================================================

create extension if not exists pg_cron with schema extensions;

-- Runs as the function owner (postgres/service role), so it bypasses RLS
-- entirely -- it is not bound by update_recipient_connection_request (0003),
-- which is scoped to the authenticated recipient only. The UPDATE below
-- still passes through PART A's trigger for validation + responded_at
-- stamping, so 'expired' is reached via the exact same enforcement path a
-- human recipient's own reject/accept would use.
select
  cron.schedule(
    'expire-pending-connection-requests',
    '*/5 * * * *',
    $$
    update public.connection_requests
    set status = 'expired'
    where status = 'pending'
      and expires_at is not null
      and expires_at <= now();
    $$
  );

comment on extension pg_cron is
  'Schedules expire-pending-connection-requests (network-connections: 48-Hour Expiry with Double Opt-In) every 5 minutes, and (see 0005_pg_cron_reconcile.sql) reconcile-outbox every 15 minutes.';
