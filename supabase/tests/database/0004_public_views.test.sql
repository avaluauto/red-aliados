-- pgTAP: 0004_public_views.sql — vehicle_snapshots_public column masking matrix
-- RED: written before the view existed, asserting min_price/tenant_name/
-- contact_phone masking per tier, plus the base-table grant revocation.
--
-- NOT executed in the apply sandbox — no reachable Postgres instance. See
-- apply-progress.

begin;
select plan(9);

-- ---------------------------------------------------------------------------
-- Fixtures (as table owner)
-- ---------------------------------------------------------------------------
insert into public.tenants (id, name) values
  ('11111111-1111-1111-1111-111111111111', 'Tenant A (viewer)'),
  ('22222222-2222-2222-2222-222222222222', 'Tenant B (connected)'),
  ('33333333-3333-3333-3333-333333333333', 'Tenant C (unrelated)'),
  ('44444444-4444-4444-4444-444444444444', 'Tenant D (candidate)');

insert into public.tenant_contacts (tenant_id, contact_name, contact_phone) values
  ('11111111-1111-1111-1111-111111111111', 'Ana (A)', '+54-11-0001'),
  ('22222222-2222-2222-2222-222222222222', 'Beto (B)', '+54-11-0002'),
  ('44444444-4444-4444-4444-444444444444', 'Dana (D)', '+54-11-0004');

insert into public.tenant_users_access (tenant_id, user_id, granted, granted_at)
values ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000001', true, now());

insert into public.vehicle_snapshots (id, tenant_id, make, model, year, min_price) values
  ('a0000000-0000-0000-0000-00000000000a', '11111111-1111-1111-1111-111111111111', 'Toyota', 'Corolla', 2020, 15000),
  ('b0000000-0000-0000-0000-00000000000b', '22222222-2222-2222-2222-222222222222', 'Ford', 'Focus', 2019, 9000),
  ('d0000000-0000-0000-0000-00000000000d', '44444444-4444-4444-4444-444444444444', 'VW', 'Golf', 2018, 8000);

insert into public.connection_requests
  (id, requester_tenant_id, recipient_tenant_id, origin_type, status, expires_at, responded_at)
values
  ('e0000000-0000-0000-0000-00000000000e', '11111111-1111-1111-1111-111111111111',
   '22222222-2222-2222-2222-222222222222', 'search_match', 'accepted', now() + interval '48 hours', now()),
  ('f0000000-0000-0000-0000-00000000000f', '11111111-1111-1111-1111-111111111111',
   '44444444-4444-4444-4444-444444444444', 'vehicle_interest', 'pending', now() + interval '48 hours', null);

insert into public.connection_edges (viewer_tenant_id, visible_tenant_id, connection_request_id)
values ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222',
        'e0000000-0000-0000-0000-00000000000e');

insert into public.vehicle_snapshot_photos (vehicle_snapshot_id, url)
values ('d0000000-0000-0000-0000-00000000000d', 'https://example.test/golf.jpg');

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', 'aaaaaaaa-0000-0000-0000-000000000001',
                     'tenant_id', '11111111-1111-1111-1111-111111111111',
                     'red_aliados_enabled', true)::text, true);
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', true);

-- owner tier (A's own vehicle): everything visible, min_price included
select results_eq(
  $$ select min_price, tenant_name, contact_phone, visibility_tier
     from public.vehicle_snapshots_public where id = 'a0000000-0000-0000-0000-00000000000a' $$,
  $$ values (15000::numeric, 'Tenant A (viewer)'::text, '+54-11-0001'::text, 'owner'::text) $$,
  'owner tier: min_price, name, and contact are all visible on the caller''s own vehicle'
);

-- connected tier (B via active edge): name + contact visible, min_price masked
select results_eq(
  $$ select min_price, tenant_name, contact_phone, visibility_tier
     from public.vehicle_snapshots_public where id = 'b0000000-0000-0000-0000-00000000000b' $$,
  $$ values (null::numeric, 'Tenant B (connected)'::text, '+54-11-0002'::text, 'connected'::text) $$,
  'connected tier: name and contact visible, min_price masked (owner-only)'
);

-- candidate tier (D via pending request, no edge): name + contact masked, min_price masked
select results_eq(
  $$ select min_price, tenant_name, contact_phone, visibility_tier
     from public.vehicle_snapshots_public where id = 'd0000000-0000-0000-0000-00000000000d' $$,
  $$ values (null::numeric, null::text, null::text, 'candidate'::text) $$,
  'candidate tier: vehicle visible but name, contact, AND min_price are all masked'
);

-- none tier (C has no vehicle fixture with a request/edge to A) — view returns zero rows
select is_empty(
  $$ select id from public.vehicle_snapshots_public where tenant_id = '33333333-3333-3333-3333-333333333333' $$,
  'none tier: zero rows for an unrelated tenant via the view'
);

-- Base table is fully revoked — even a syntactically valid query errors, not just empty.
select throws_ok(
  $$ select 1 from public.vehicle_snapshots limit 1 $$,
  '42501',
  null,
  'authenticated has no SELECT privilege on the vehicle_snapshots base table (must go through the view)'
);
select throws_ok(
  $$ select 1 from public.tenants limit 1 $$,
  '42501',
  null,
  'authenticated has no SELECT privilege on the tenants base table'
);
select throws_ok(
  $$ select 1 from public.tenant_contacts limit 1 $$,
  '42501',
  null,
  'authenticated has no SELECT privilege on the tenant_contacts base table'
);

-- View grant exists
select table_privs_are('public', 'vehicle_snapshots_public', 'authenticated', array['SELECT'],
  'authenticated has exactly SELECT on vehicle_snapshots_public');

-- Photos of a masked (candidate-tier) vehicle are still row-visible (row filtering only —
-- photos carry no sensitive columns to mask).
select isnt_empty(
  $$ select id from public.vehicle_snapshot_photos where vehicle_snapshot_id = 'd0000000-0000-0000-0000-00000000000d' $$,
  'candidate-tier vehicle photos remain row-visible via app.vehicle_snapshot_visible()'
);

select * from finish();
rollback;
