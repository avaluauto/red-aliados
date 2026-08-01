-- 0003_rls_policies.sql
-- Phase 1 (PR1): deny-by-default RLS on every table. RLS is THE enforcement
-- point (network-authorization: Deny-by-Default Enforcement Point) — client
-- UI guards are convenience only. Every policy composes the app.* helpers
-- from 0002; none re-derives layer logic inline.
--
-- Scope note: Phase 1 establishes the baseline tenant-isolation boundary that
-- every later feature phase depends on. Fine-grained business-rule columns
-- (e.g. exactly which connection_requests.status transitions a client may
-- perform) are intentionally left to their owning feature phase (Phase 6:
-- network-connections) per the task boundary — what ships here already
-- guarantees no cross-tenant data leak, which is the actual security
-- boundary Phase 1 must nail.
--
-- `anon` gets nothing anywhere: Red Aliados has zero unauthenticated surface
-- (identity-bridge: zero local user table, zero self-registration).

revoke all on all tables in schema public from anon;

alter table public.tenants enable row level security;
alter table public.tenant_contacts enable row level security;
alter table public.tenant_users_access enable row level security;
alter table public.vehicle_snapshots enable row level security;
alter table public.vehicle_snapshot_photos enable row level security;
alter table public.search_requests enable row level security;
alter table public.search_request_targets enable row level security;
alter table public.connection_requests enable row level security;
alter table public.connection_edges enable row level security;
alter table public.connection_messages enable row level security;
alter table public.reputation_events enable row level security;
alter table public.search_opportunities_out enable row level security;
alter table public.sync_event_log enable row level security;

-- =============================================================================
-- tenants — name is masked at the `candidate` tier (network-connections:
-- Candidate Visibility Tier), which RLS alone cannot express (row-level only,
-- not column-level). Base table SELECT is denied entirely for `authenticated`;
-- reads go through vehicle_snapshots_public's masked join (0004).
-- =============================================================================
-- No policies for `authenticated` — RLS-enabled + zero policies = deny-by-default.

-- =============================================================================
-- tenant_contacts — phone reveal is gated by Contact Reveal Gated by
-- Acceptance (tenant-directory), i.e. the `connected` tier only. Same
-- reasoning as tenants: base table denied, reads go through the view.
-- =============================================================================
-- No policies for `authenticated` — deny-by-default; view-only access.

-- =============================================================================
-- tenant_users_access — a user may see their own access grants within their
-- own tenant. Granting/revoking access is a tenant-admin action out of Phase 1
-- scope (no admin UI spec'd yet); writes stay service-role only for now.
-- =============================================================================
create policy select_own_access_grant on public.tenant_users_access
  for select to authenticated
  using (
    tenant_id = app.current_tenant_id()
    and user_id = auth.uid()
  );

-- =============================================================================
-- vehicle_snapshots — read-only mirror (vehicle-sync: Read-Only Mirror). RLS
-- expresses ROW visibility (tier <> none); column masking (min_price) is the
-- view's job (0004), which also revokes this table's SELECT grant so the view
-- cannot be bypassed. Zero mutation policies: no write path exists at all.
-- =============================================================================
create policy select_visible_vehicle_snapshots on public.vehicle_snapshots
  for select to authenticated
  using (app.visibility_tier(tenant_id) <> 'none');

-- =============================================================================
-- vehicle_snapshot_photos — visible iff its parent vehicle snapshot is visible.
-- Uses app.vehicle_snapshot_visible() (SECURITY DEFINER) rather than a raw
-- subquery against vehicle_snapshots, because 0004 revokes SELECT on that
-- base table from `authenticated` — a direct subquery would fail with
-- "permission denied" once 0004 runs.
-- =============================================================================
create policy select_visible_vehicle_snapshot_photos on public.vehicle_snapshot_photos
  for select to authenticated
  using (app.vehicle_snapshot_visible(vehicle_snapshot_id));

-- =============================================================================
-- search_requests — visible/manageable only within the owning tenant.
-- =============================================================================
create policy select_own_tenant_search_requests on public.search_requests
  for select to authenticated
  using (
    app.module_enabled()
    and tenant_id = app.current_tenant_id()
  );

create policy insert_own_tenant_search_request on public.search_requests
  for insert to authenticated
  with check (
    app.module_enabled()
    and tenant_id = app.current_tenant_id()
    and requested_by = auth.uid()
  );

create policy update_own_tenant_search_request on public.search_requests
  for update to authenticated
  using (
    app.module_enabled()
    and tenant_id = app.current_tenant_id()
  )
  with check (
    tenant_id = app.current_tenant_id()
  );

-- =============================================================================
-- search_request_targets — visible/manageable only by the owning search_request's tenant.
-- =============================================================================
create policy select_own_search_request_targets on public.search_request_targets
  for select to authenticated
  using (
    exists (
      select 1
      from public.search_requests sr
      where sr.id = search_request_targets.search_request_id
        and app.module_enabled()
        and sr.tenant_id = app.current_tenant_id()
    )
  );

create policy insert_own_search_request_targets on public.search_request_targets
  for insert to authenticated
  with check (
    exists (
      select 1
      from public.search_requests sr
      where sr.id = search_request_targets.search_request_id
        and app.module_enabled()
        and sr.tenant_id = app.current_tenant_id()
    )
    -- Opt-In Fan-Out to Connected Tenants Only: the target must be an active connection.
    and app.is_connected(target_tenant_id)
  );

-- =============================================================================
-- connection_requests
-- =============================================================================

-- SELECT: visible to either participating tenant (requester or recipient).
create policy select_own_connection_requests on public.connection_requests
  for select to authenticated
  using (
    app.module_enabled()
    and app.has_network_access()
    and (
      requester_tenant_id = app.current_tenant_id()
      or recipient_tenant_id = app.current_tenant_id()
    )
  );

-- INSERT: the ONLY insert policy for `authenticated`. origin_type is
-- restricted to vehicle_interest/search_match — 'direct' has deliberately NO
-- insert path here (Manual Cold-Start Seeding: only service_role, which
-- bypasses RLS entirely, may write it; enforced structurally by
-- connection_requests_direct_requires_seeded_by in 0001 too).
create policy insert_own_request on public.connection_requests
  for insert to authenticated
  with check (
    app.module_enabled()
    and app.has_network_access()
    and requester_tenant_id = app.current_tenant_id()
    and origin_type in ('vehicle_interest', 'search_match')
  );

-- UPDATE: only the recipient tenant may act on an inbound request (accept /
-- reject / promote a suggestion to pending). The state machine's exact
-- transition rules are enforced in Phase 6 (network-connections); this policy
-- guarantees only the correct tenant can touch the row at all.
create policy update_recipient_connection_request on public.connection_requests
  for update to authenticated
  using (
    app.module_enabled()
    and app.has_network_access()
    and recipient_tenant_id = app.current_tenant_id()
  )
  with check (
    recipient_tenant_id = app.current_tenant_id()
  );

-- =============================================================================
-- connection_edges — read-only from the client's perspective. Edges are the
-- visibility grant itself; they are written by trigger/service-role logic
-- when a connection_requests row is accepted (Phase 6), never directly by an
-- authenticated client.
-- =============================================================================
create policy select_own_connection_edges on public.connection_edges
  for select to authenticated
  using (
    app.module_enabled()
    and app.has_network_access()
    and viewer_tenant_id = app.current_tenant_id()
  );

-- =============================================================================
-- connection_messages — visible/writable only to the two tenants party to the
-- originating connection_requests row (connection-messaging: Origin-Scoped
-- Thread). Access does not require the `connected` tier — a thread exists
-- from the request's creation, pre-acceptance.
-- =============================================================================
create policy select_own_thread_messages on public.connection_messages
  for select to authenticated
  using (
    app.module_enabled()
    and app.has_network_access()
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

create policy insert_own_thread_message on public.connection_messages
  for insert to authenticated
  with check (
    app.module_enabled()
    and app.has_network_access()
    and sender_tenant_id = app.current_tenant_id()
    and sender_user_id = auth.uid()
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

-- =============================================================================
-- reputation_events — read-only from the client. Emitted by a DB trigger on
-- terminal connection_requests outcomes (Phase 7.2), never client-inserted
-- (partner-reputation: Score is read-only).
-- =============================================================================
create policy select_reputation_events on public.reputation_events
  for select to authenticated
  using (
    app.module_enabled()
    and (
      tenant_id = app.current_tenant_id()
      or (app.has_network_access() and app.visibility_tier(tenant_id) in ('candidate', 'connected'))
    )
  );

-- =============================================================================
-- search_opportunities_out — visible/insertable only by the requesting
-- tenant (targeted-search: Explicit Proceed Fires Opportunity Event).
-- =============================================================================
create policy select_own_search_opportunities_out on public.search_opportunities_out
  for select to authenticated
  using (
    exists (
      select 1
      from public.search_requests sr
      where sr.id = search_opportunities_out.search_request_id
        and app.module_enabled()
        and sr.tenant_id = app.current_tenant_id()
    )
  );

create policy insert_own_search_opportunity_out on public.search_opportunities_out
  for insert to authenticated
  with check (
    proceeded_by = auth.uid()
    and exists (
      select 1
      from public.search_requests sr
      where sr.id = search_opportunities_out.search_request_id
        and app.module_enabled()
        and sr.tenant_id = app.current_tenant_id()
    )
    -- No Auto-Share: only a match against a tenant the requester can already
    -- see (own inventory or an active connection) may be proceeded on.
    and app.visibility_tier(matched_tenant_id) <> 'none'
  );

-- =============================================================================
-- sync_event_log — fully internal. No policies for `authenticated`: only
-- service_role (Edge Functions, bypasses RLS) reads or writes this table.
-- =============================================================================
-- No policies for `authenticated` — deny-by-default.
