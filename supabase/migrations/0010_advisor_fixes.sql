-- 0010_advisor_fixes.sql
-- Corrective migration for findings from Supabase's own security/performance
-- advisor (`get_advisors`), run against the real project immediately after
-- 0001-0009 were applied for the first time. Follows the same standalone-fix
-- convention as 0007/0009 -- does not hand-edit 0001-0009.
--
-- Advisor findings NOT addressed here because they are intentional design,
-- already documented at their source (verified against the advisor output,
-- not assumed):
--   - tenants / tenant_contacts / sync_event_log: RLS enabled, zero policies
--     for `authenticated` -- deliberate deny-by-default (see 0003's header).
--   - vehicle_snapshots_public: SECURITY DEFINER view -- required so the view
--     can still read base tables after their SELECT grant is revoked from
--     `authenticated` (see 0004's header).
--   - public.rls_auto_enable(): a Supabase-platform event trigger function
--     (owner `postgres`), not introduced by any migration in this repo;
--     confirmed via pg_get_functiondef() before ruling it out.
--   - "unused index" INFO findings: expected on a freshly-migrated, empty
--     database -- these indexes exist for query patterns documented at their
--     original creation (e.g. connection_requests_pending_expiry_idx for the
--     pg_cron auto-expire scan), not dead weight.

-- =============================================================================
-- SECURITY: app.set_updated_at was the one function in this project missing
-- the search_path pin every other app.* function has (0002's header: "Each
-- pins search_path to guard against search_path hijacking"). Practical risk
-- is low here (the body only calls now()), but it's a real inconsistency
-- with the project's own established pattern.
-- =============================================================================
create or replace function app.set_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- =============================================================================
-- PERFORMANCE: auth.uid() called directly (not through an app.* wrapper) in
-- these 4 policies gets re-evaluated once per row instead of once per
-- statement. Wrap in (select auth.uid()) per Supabase's documented fix:
-- https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select
-- Only these 4 were flagged -- every other policy already goes through
-- app.current_tenant_id()/app.module_enabled()/etc., which the advisor did
-- not flag, so those are left untouched.
-- =============================================================================
alter policy select_own_access_grant on public.tenant_users_access
  using (
    tenant_id = app.current_tenant_id()
    and user_id = (select auth.uid())
  );

alter policy insert_own_tenant_search_request on public.search_requests
  with check (
    app.module_enabled()
    and tenant_id = app.current_tenant_id()
    and requested_by = (select auth.uid())
  );

alter policy insert_own_thread_message on public.connection_messages
  with check (
    app.module_enabled()
    and app.has_network_access()
    and sender_tenant_id = app.current_tenant_id()
    and sender_user_id = (select auth.uid())
    and exists (
      select 1
      from public.connection_requests r
      where r.id = connection_messages.connection_request_id
        and (
          r.requester_tenant_id = app.current_tenant_id()
          or r.recipient_tenant_id = app.current_tenant_id()
        )
    )
  );

alter policy insert_own_search_opportunity_out on public.search_opportunities_out
  with check (
    proceeded_by = (select auth.uid())
    and exists (
      select 1
      from public.search_requests sr
      where sr.id = search_opportunities_out.search_request_id
        and app.module_enabled()
        and sr.tenant_id = app.current_tenant_id()
    )
    and app.visibility_tier(matched_tenant_id) <> 'none'
  );

-- =============================================================================
-- PERFORMANCE: covering indexes for FK columns the advisor flagged as
-- unindexed. Postgres does not auto-index FK columns; missing coverage means
-- a seq scan on the referencing table for every UPDATE/DELETE on the
-- referenced row (e.g. revoking a connection_edges row, deleting a tenant).
-- =============================================================================
create index connection_edges_connection_request_id_idx
  on public.connection_edges (connection_request_id);
create index connection_edges_visible_tenant_id_idx
  on public.connection_edges (visible_tenant_id);
create index connection_messages_sender_tenant_id_idx
  on public.connection_messages (sender_tenant_id);
create index connection_requests_search_request_id_idx
  on public.connection_requests (search_request_id);
create index connection_requests_vehicle_snapshot_id_idx
  on public.connection_requests (vehicle_snapshot_id);
create index search_opportunities_out_matched_tenant_id_idx
  on public.search_opportunities_out (matched_tenant_id);
create index search_opportunities_out_vehicle_snapshot_id_idx
  on public.search_opportunities_out (vehicle_snapshot_id);
