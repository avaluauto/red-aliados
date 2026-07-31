-- pgTAP: 0002_app_helpers.sql
-- RED: written before the helper functions existed, asserting each `app.*`
-- function's behavior in isolation, then app.visibility_tier() composing them.
--
-- ASSUMPTION: this file relies on Supabase's standard local `auth` schema
-- (auth.uid()/auth.jwt() reading `request.jwt.claim.sub` / `request.jwt.claims`
-- via set_config), which ships with `supabase start`. It was NOT verified to
-- exist in the apply sandbox — see apply-progress for what could/could not run.

begin;
select plan(18);

-- ---------------------------------------------------------------------------
-- Fixtures: two tenants, a granted user in tenant A, an ungranted user in tenant A
-- ---------------------------------------------------------------------------
insert into public.tenants (id, name) values
  ('11111111-1111-1111-1111-111111111111', 'Tenant A'),
  ('22222222-2222-2222-2222-222222222222', 'Tenant B'),
  ('33333333-3333-3333-3333-333333333333', 'Tenant C (unrelated)');

insert into public.tenant_users_access (tenant_id, user_id, granted, granted_at)
values
  ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000001', true, now()),
  ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000002', false, null);

-- A pending connection_requests row links A <-> B (candidate tier fixture)
insert into public.connection_requests
  (id, requester_tenant_id, recipient_tenant_id, origin_type, status, expires_at)
values
  ('44444444-4444-4444-4444-444444444444', '11111111-1111-1111-1111-111111111111',
   '22222222-2222-2222-2222-222222222222', 'search_match', 'pending', now() + interval '48 hours');

-- ---------------------------------------------------------------------------
-- app.module_enabled()
-- ---------------------------------------------------------------------------
-- Assertions run as `authenticated` (fixtures above ran as table owner,
-- bypassing RLS) — matches 0003/0004's pattern so this exercises the real
-- caller identity, not a superuser that would pass regardless of grants.
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', 'aaaaaaaa-0000-0000-0000-000000000001',
                     'tenant_id', '11111111-1111-1111-1111-111111111111',
                     'red_aliados_enabled', true)::text, true);
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', true);
select ok(app.module_enabled(), 'module_enabled() true when JWT claim is true');

select set_config('request.jwt.claims',
  json_build_object('sub', 'aaaaaaaa-0000-0000-0000-000000000001',
                     'tenant_id', '11111111-1111-1111-1111-111111111111',
                     'red_aliados_enabled', false)::text, true);
select ok(not app.module_enabled(), 'module_enabled() false when JWT claim is false');

select set_config('request.jwt.claims',
  json_build_object('sub', 'aaaaaaaa-0000-0000-0000-000000000001',
                     'tenant_id', '11111111-1111-1111-1111-111111111111')::text, true);
select ok(not app.module_enabled(), 'module_enabled() false (not error) when claim is absent');

-- ---------------------------------------------------------------------------
-- app.current_tenant_id()
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims',
  json_build_object('sub', 'aaaaaaaa-0000-0000-0000-000000000001',
                     'tenant_id', '11111111-1111-1111-1111-111111111111',
                     'red_aliados_enabled', true)::text, true);
select is(app.current_tenant_id(), '11111111-1111-1111-1111-111111111111'::uuid,
  'current_tenant_id() reads the tenant_id claim');

-- ---------------------------------------------------------------------------
-- app.has_network_access()
-- ---------------------------------------------------------------------------
select ok(app.has_network_access(), 'granted user has network access');

select set_config('request.jwt.claims',
  json_build_object('sub', 'aaaaaaaa-0000-0000-0000-000000000002',
                     'tenant_id', '11111111-1111-1111-1111-111111111111',
                     'red_aliados_enabled', true)::text, true);
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000002', true);
select ok(not app.has_network_access(), 'ungranted user in the same tenant has no network access');

-- ---------------------------------------------------------------------------
-- app.is_connected() / app.has_candidate_link() — before any edge exists
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims',
  json_build_object('sub', 'aaaaaaaa-0000-0000-0000-000000000001',
                     'tenant_id', '11111111-1111-1111-1111-111111111111',
                     'red_aliados_enabled', true)::text, true);
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', true);

select ok(not app.is_connected('22222222-2222-2222-2222-222222222222'),
  'is_connected() false: no connection_edges row yet');
select ok(app.has_candidate_link('22222222-2222-2222-2222-222222222222'),
  'has_candidate_link() true: a pending connection_requests row links A and B');
select ok(not app.has_candidate_link('33333333-3333-3333-3333-333333333333'),
  'has_candidate_link() false: no request links A and C');

-- ---------------------------------------------------------------------------
-- app.visibility_tier() — full matrix
-- ---------------------------------------------------------------------------
select is(app.visibility_tier('11111111-1111-1111-1111-111111111111'), 'owner',
  'visibility_tier(own tenant) = owner');
select is(app.visibility_tier('22222222-2222-2222-2222-222222222222'), 'candidate',
  'visibility_tier(B) = candidate: pending request, no edge yet');
select is(app.visibility_tier('33333333-3333-3333-3333-333333333333'), 'none',
  'visibility_tier(C) = none: no request, no edge, not owner');

-- Add an active edge A -> B and re-check
insert into public.connection_edges (viewer_tenant_id, visible_tenant_id, connection_request_id)
values ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222',
        '44444444-4444-4444-4444-444444444444');

select is(app.visibility_tier('22222222-2222-2222-2222-222222222222'), 'connected',
  'visibility_tier(B) = connected once an active edge exists (edge outranks candidate)');

-- Module disabled overrides everything, including owner
select set_config('request.jwt.claims',
  json_build_object('sub', 'aaaaaaaa-0000-0000-0000-000000000001',
                     'tenant_id', '11111111-1111-1111-1111-111111111111',
                     'red_aliados_enabled', false)::text, true);
select is(app.visibility_tier('11111111-1111-1111-1111-111111111111'), 'none',
  'visibility_tier(own tenant) = none when module is disabled — layer 1 overrides owner');

-- Ungranted user in tenant A sees nothing cross-tenant even with a candidate link
select set_config('request.jwt.claims',
  json_build_object('sub', 'aaaaaaaa-0000-0000-0000-000000000002',
                     'tenant_id', '11111111-1111-1111-1111-111111111111',
                     'red_aliados_enabled', true)::text, true);
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000002', true);
select is(app.visibility_tier('22222222-2222-2222-2222-222222222222'), 'none',
  'visibility_tier(B) = none for an ungranted user despite the candidate link (layer 3 gates cross-tenant tiers)');
select is(app.visibility_tier('11111111-1111-1111-1111-111111111111'), 'owner',
  'visibility_tier(own tenant) = owner even for an ungranted user (layer 3 only gates OTHER tenants)');

-- Grants: authenticated can call, PUBLIC/anon cannot (structural check)
select function_privs_are('app', 'visibility_tier', array['uuid'], 'authenticated', array['EXECUTE'],
  'authenticated has EXECUTE on app.visibility_tier');
select function_privs_are('app', 'visibility_tier', array['uuid'], 'anon', array[]::text[],
  'anon has no privileges on app.visibility_tier');

select * from finish();
rollback;
