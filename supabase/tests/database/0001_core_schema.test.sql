-- pgTAP: 0001_core_schema.sql
-- RED: written before the migration existed, asserting the 13-table schema and
-- its structural constraints. Run via `supabase test db` (pg_prove under the hood).
--
-- NOTE (environment): this file could not be executed in the apply sandbox —
-- no Supabase CLI / local Postgres instance was reachable. See apply-progress
-- for exactly what was and was not verified.

begin;
select plan(33);

-- ---------------------------------------------------------------------------
-- All 13 tables exist
-- ---------------------------------------------------------------------------
select has_table('public', 'tenants', 'tenants table exists');
select has_table('public', 'tenant_contacts', 'tenant_contacts table exists');
select has_table('public', 'tenant_users_access', 'tenant_users_access table exists');
select has_table('public', 'vehicle_snapshots', 'vehicle_snapshots table exists');
select has_table('public', 'vehicle_snapshot_photos', 'vehicle_snapshot_photos table exists');
select has_table('public', 'search_requests', 'search_requests table exists');
select has_table('public', 'search_request_targets', 'search_request_targets table exists');
select has_table('public', 'connection_requests', 'connection_requests table exists');
select has_table('public', 'connection_edges', 'connection_edges table exists');
select has_table('public', 'connection_messages', 'connection_messages table exists');
select has_table('public', 'reputation_events', 'reputation_events table exists');
select has_table('public', 'search_opportunities_out', 'search_opportunities_out table exists');
select has_table('public', 'sync_event_log', 'sync_event_log table exists');

-- ---------------------------------------------------------------------------
-- app schema + helper trigger exist
-- ---------------------------------------------------------------------------
select has_schema('app', 'app schema exists');
select has_function('app', 'set_updated_at', 'app.set_updated_at() trigger fn exists');

-- ---------------------------------------------------------------------------
-- Design-mandated partial unique index on connection_edges
-- ---------------------------------------------------------------------------
select has_index(
  'public', 'connection_edges', 'connection_edges_viewer_visible_active_idx',
  array['viewer_tenant_id', 'visible_tenant_id'],
  'connection_edges has the (viewer_tenant_id, visible_tenant_id) partial index'
);

-- ---------------------------------------------------------------------------
-- Fixture tenants for constraint tests
-- ---------------------------------------------------------------------------
insert into public.tenants (id, name) values
  ('11111111-1111-1111-1111-111111111111', 'Tenant A'),
  ('22222222-2222-2222-2222-222222222222', 'Tenant B');

-- tenant_contacts: exactly one per tenant
select lives_ok(
  $$ insert into public.tenant_contacts (tenant_id, contact_name, contact_phone)
     values ('11111111-1111-1111-1111-111111111111', 'Ana', '+54911') $$,
  'first contact for a tenant succeeds'
);
select throws_ok(
  $$ insert into public.tenant_contacts (tenant_id, contact_name, contact_phone)
     values ('11111111-1111-1111-1111-111111111111', 'Beto', '+54922') $$,
  '23505',
  null,
  'a second contact for the same tenant violates unique(tenant_id)'
);

-- tenant_users_access: unique(tenant_id, user_id)
select lives_ok(
  $$ insert into public.tenant_users_access (tenant_id, user_id, granted)
     values ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000001', true) $$,
  'first access grant for (tenant, user) succeeds'
);
select throws_ok(
  $$ insert into public.tenant_users_access (tenant_id, user_id, granted)
     values ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000001', false) $$,
  '23505',
  null,
  'duplicate (tenant_id, user_id) access row violates unique constraint'
);

-- connection_requests: no self-link
select throws_ok(
  $$ insert into public.connection_requests
       (requester_tenant_id, recipient_tenant_id, origin_type, status)
     values
       ('11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 'search_match', 'pending') $$,
  '23514',
  null,
  'requester_tenant_id = recipient_tenant_id violates connection_requests_no_self_link'
);

-- connection_requests: direct requires seeded_by
select throws_ok(
  $$ insert into public.connection_requests
       (requester_tenant_id, recipient_tenant_id, origin_type, status)
     values
       ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'direct', 'suggested') $$,
  '23514',
  null,
  'origin_type=direct without seeded_by violates connection_requests_direct_requires_seeded_by'
);
select throws_ok(
  $$ insert into public.connection_requests
       (requester_tenant_id, recipient_tenant_id, origin_type, status, seeded_by)
     values
       ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'search_match', 'pending', 'operator-note') $$,
  '23514',
  null,
  'non-direct origin_type with seeded_by set also violates connection_requests_direct_requires_seeded_by'
);
select lives_ok(
  $$ insert into public.connection_requests
       (id, requester_tenant_id, recipient_tenant_id, origin_type, status, seeded_by, expires_at)
     values
       ('33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111',
        '22222222-2222-2222-2222-222222222222', 'direct', 'suggested', 'seeded by ops for pilot', null) $$,
  'a valid direct/suggested seeded row inserts cleanly'
);

-- connection_edges: no self-edge + partial unique active-edge index
select throws_ok(
  $$ insert into public.connection_edges (viewer_tenant_id, visible_tenant_id, connection_request_id)
     values ('11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111',
             '33333333-3333-3333-3333-333333333333') $$,
  '23514',
  null,
  'viewer_tenant_id = visible_tenant_id violates connection_edges_no_self_edge'
);
select lives_ok(
  $$ insert into public.connection_edges (viewer_tenant_id, visible_tenant_id, connection_request_id)
     values ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222',
             '33333333-3333-3333-3333-333333333333') $$,
  'first active edge for (viewer, visible) succeeds'
);
select throws_ok(
  $$ insert into public.connection_edges (viewer_tenant_id, visible_tenant_id, connection_request_id)
     values ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222',
             '33333333-3333-3333-3333-333333333333') $$,
  '23505',
  null,
  'a second ACTIVE edge for the same (viewer, visible) pair violates the partial unique index'
);
select lives_ok(
  $$ update public.connection_edges set revoked_at = now()
     where viewer_tenant_id = '11111111-1111-1111-1111-111111111111'
       and visible_tenant_id = '22222222-2222-2222-2222-222222222222' $$,
  'revoking the edge frees the partial index slot'
);
select lives_ok(
  $$ insert into public.connection_edges (viewer_tenant_id, visible_tenant_id, connection_request_id)
     values ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222',
             '33333333-3333-3333-3333-333333333333') $$,
  'a new active edge for the same pair is allowed once the prior one is revoked'
);

-- reputation_events: one terminal event per connection_request
select lives_ok(
  $$ insert into public.reputation_events (tenant_id, connection_request_id, event_type, response_time_seconds)
     values ('22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333333', 'accepted', 120) $$,
  'first reputation event for a request succeeds'
);
select throws_ok(
  $$ insert into public.reputation_events (tenant_id, connection_request_id, event_type, response_time_seconds)
     values ('22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333333', 'rejected', 60) $$,
  '23505',
  null,
  'a second reputation event for the same connection_request violates unique(connection_request_id)'
);

-- sync_event_log: unique(source, event_id) — the idempotency dedupe key
select lives_ok(
  $$ insert into public.sync_event_log (source, event_id, aggregate_type, aggregate_id, source_seq)
     values ('v2-outbox', 'evt-001', 'vehicle', 'veh-1', 1) $$,
  'first ingestion of an outbox event id succeeds'
);
select results_eq(
  $$ insert into public.sync_event_log (source, event_id, aggregate_type, aggregate_id, source_seq)
     values ('v2-outbox', 'evt-001', 'vehicle', 'veh-1', 1)
     on conflict (source, event_id) do nothing
     returning 1 $$,
  $$ select 1 where false $$,
  'duplicate delivery of the same event_id is a true no-op (0 rows), not an error'
);

select * from finish();
rollback;
