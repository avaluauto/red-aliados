-- pgTAP: 0003_rls_policies.sql — masking matrix (owner/connected/candidate/none)
-- RED: written before the RLS policies existed, asserting row-level visibility
-- for all four app.visibility_tier() states plus the deny-by-default baseline
-- on tenant_users_access, tenants, and sync_event_log.
--
-- Fixture setup runs as the table-owning role (bypasses RLS, e.g. `postgres`
-- in a local Supabase Postgres). Assertions run `set local role authenticated`
-- with JWT claims faked via request.jwt.claims / request.jwt.claim.sub —
-- see 0002's test file header for the same assumption.
--
-- NOT executed in the apply sandbox — no reachable Postgres instance. See
-- apply-progress.

begin;
select plan(11);

-- ---------------------------------------------------------------------------
-- Fixtures (as table owner — bypasses RLS)
-- ---------------------------------------------------------------------------
insert into public.tenants (id, name) values
  ('11111111-1111-1111-1111-111111111111', 'Tenant A (viewer)'),
  ('22222222-2222-2222-2222-222222222222', 'Tenant B (connected)'),
  ('33333333-3333-3333-3333-333333333333', 'Tenant C (unrelated)'),
  ('44444444-4444-4444-4444-444444444444', 'Tenant D (candidate)');

insert into public.tenant_users_access (tenant_id, user_id, granted, granted_at)
values ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000001', true, now());

insert into public.vehicle_snapshots (id, tenant_id, make, model, year) values
  ('a0000000-0000-0000-0000-00000000000a', '11111111-1111-1111-1111-111111111111', 'Toyota', 'Corolla', 2020),
  ('b0000000-0000-0000-0000-00000000000b', '22222222-2222-2222-2222-222222222222', 'Ford', 'Focus', 2019),
  ('c0000000-0000-0000-0000-00000000000c', '33333333-3333-3333-3333-333333333333', 'Honda', 'Civic', 2021),
  ('d0000000-0000-0000-0000-00000000000d', '44444444-4444-4444-4444-444444444444', 'VW', 'Golf', 2018);

insert into public.vehicle_snapshot_photos (vehicle_snapshot_id, url) values
  ('b0000000-0000-0000-0000-00000000000b', 'https://example.test/focus.jpg');

-- Active edge A -> B (connected tier)
insert into public.connection_requests
  (id, requester_tenant_id, recipient_tenant_id, origin_type, status, expires_at, responded_at)
values
  ('e0000000-0000-0000-0000-00000000000e', '11111111-1111-1111-1111-111111111111',
   '22222222-2222-2222-2222-222222222222', 'search_match', 'accepted', now() + interval '48 hours', now());
insert into public.connection_edges (viewer_tenant_id, visible_tenant_id, connection_request_id)
values ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222',
        'e0000000-0000-0000-0000-00000000000e');

-- Pending request A <-> D (candidate tier), no edge
insert into public.connection_requests
  (id, requester_tenant_id, recipient_tenant_id, origin_type, status, expires_at)
values
  ('f0000000-0000-0000-0000-00000000000f', '11111111-1111-1111-1111-111111111111',
   '44444444-4444-4444-4444-444444444444', 'vehicle_interest', 'pending', now() + interval '48 hours');

-- `supabase test db` applies ALL migrations (through 0004) before any test
-- file runs, so by now 0004 has already revoked SELECT on vehicle_snapshots
-- and tenants from `authenticated`. This test's job is the RLS POLICY layer
-- specifically (row filtering via app.visibility_tier()), independent of
-- 0004's separate "force reads through the view" grant revocation — so
-- re-grant table-level SELECT here, scoped to this rolled-back transaction,
-- to isolate the two concerns. The tenants/sync_event_log deny-by-default
-- assertions below still hold: RLS-enabled-with-zero-policies denies all rows
-- regardless of table-level grants.
grant select on public.vehicle_snapshots to authenticated;
grant select on public.tenants to authenticated;

-- ---------------------------------------------------------------------------
-- Assertions as tenant A's granted user
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', 'aaaaaaaa-0000-0000-0000-000000000001',
                     'tenant_id', '11111111-1111-1111-1111-111111111111',
                     'red_aliados_enabled', true)::text, true);
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', true);

-- owner tier: own vehicle visible
select results_eq(
  $$ select id from public.vehicle_snapshots where id = 'a0000000-0000-0000-0000-00000000000a' $$,
  $$ values ('a0000000-0000-0000-0000-00000000000a'::uuid) $$,
  'owner tier: tenant A sees its own vehicle row'
);

-- connected tier: B's vehicle visible via active edge
select results_eq(
  $$ select id from public.vehicle_snapshots where id = 'b0000000-0000-0000-0000-00000000000b' $$,
  $$ values ('b0000000-0000-0000-0000-00000000000b'::uuid) $$,
  'connected tier: tenant A sees tenant B''s vehicle via an active edge'
);
select results_eq(
  $$ select vehicle_snapshot_id from public.vehicle_snapshot_photos
     where vehicle_snapshot_id = 'b0000000-0000-0000-0000-00000000000b' $$,
  $$ values ('b0000000-0000-0000-0000-00000000000b'::uuid) $$,
  'connected tier: photos of a visible vehicle are visible too'
);

-- candidate tier: D's vehicle visible via pending request, no edge
select results_eq(
  $$ select id from public.vehicle_snapshots where id = 'd0000000-0000-0000-0000-00000000000d' $$,
  $$ values ('d0000000-0000-0000-0000-00000000000d'::uuid) $$,
  'candidate tier: tenant A sees tenant D''s vehicle via a pending request, no edge required'
);

-- none tier: C's vehicle NOT visible — no request, no edge
select is_empty(
  $$ select id from public.vehicle_snapshots where id = 'c0000000-0000-0000-0000-00000000000c' $$,
  'none tier: tenant A sees zero rows for tenant C (no request, no edge)'
);

-- deny-by-default: base tenants table returns nothing directly (view-only reads)
select is_empty(
  $$ select id from public.tenants $$,
  'tenants base table is fully denied to authenticated — zero rows even for own tenant'
);

-- deny-by-default: sync_event_log is fully denied to authenticated
select is_empty(
  $$ select id from public.sync_event_log $$,
  'sync_event_log is fully denied to authenticated (service_role only)'
);

-- tenant_users_access: only own row visible
select results_eq(
  $$ select user_id from public.tenant_users_access $$,
  $$ values ('aaaaaaaa-0000-0000-0000-000000000001'::uuid) $$,
  'tenant_users_access: authenticated user sees only their own access row'
);

-- insert_own_request: origin_type=direct is rejected for authenticated (no policy allows it)
select throws_ok(
  $$ insert into public.connection_requests
       (requester_tenant_id, recipient_tenant_id, origin_type, status, seeded_by)
     values ('11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333',
             'direct', 'suggested', 'ops note') $$,
  '42501',
  null,
  'authenticated cannot insert an origin_type=direct connection_requests row (RLS denies it)'
);

-- insert_own_request: a valid vehicle_interest request from tenant A succeeds
select lives_ok(
  $$ insert into public.connection_requests
       (requester_tenant_id, recipient_tenant_id, origin_type, status, expires_at)
     values ('11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333',
             'vehicle_interest', 'pending', now() + interval '48 hours') $$,
  'authenticated CAN insert a vehicle_interest connection_requests row as the requester'
);

-- update_recipient_connection_request: tenant A (requester, not recipient) cannot update the D
-- request — the USING clause excludes the row, so this is a silent 0-row UPDATE, not an error.
select results_eq(
  $$ update public.connection_requests set status = 'accepted'
     where id = 'f0000000-0000-0000-0000-00000000000f'
     returning id $$,
  $$ select null::uuid where false $$,
  'the requester tenant cannot update a request it does not recipient-own (0 rows affected)'
);

select * from finish();
rollback;
