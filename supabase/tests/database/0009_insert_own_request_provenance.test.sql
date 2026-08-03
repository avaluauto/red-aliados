-- pgTAP: 0009_fix_insert_own_request_provenance.sql -- regression test for
-- the insert_own_request provenance backdoor found in post-merge review.
--
-- Exploit this guards against: insert_own_request (originally 0003, PR1)
-- restricted origin_type and requester_tenant_id = current_tenant_id(), but
-- never validated that recipient_tenant_id had any real relationship to the
-- row's stated origin. Any network-access-granted tenant could fabricate a
-- vehicle_interest or search_match connection_requests row naming an
-- arbitrary, uninvolved recipient_tenant_id -- spamming an unwanted request
-- and self-granting masked candidate-tier visibility (app.has_candidate_link,
-- 0002) into a tenant with zero legitimate relationship. Fixed by 0009
-- adding two SECURITY DEFINER-backed provenance checks to the same policy.
--
-- Assertions 6-7 guard a SECOND gap found during independent
-- re-verification of this same migration and fixed in place before it was
-- ever committed: the two new SECURITY DEFINER helpers are PostgREST-exposed
-- (app schema is in supabase/config.toml's `schemas`), so they were directly
-- RPC-callable, bypassing layers 1/3 of the Four-Layer Authorization model.
-- Both now gate on module_enabled()/has_network_access() first, mirroring
-- app.visibility_tier()'s early-return idiom (0002).
--
-- NOT EXECUTED AS PGTAP in the apply sandbox: `select * from
-- pg_available_extensions where name = 'pgtap';` returns zero rows on the
-- local Postgres 17 install available here (same documented gap every prior
-- migration's own test file has hit -- there is no pgTAP binary to load).
-- Run via `supabase test db` (pg_prove) once a real Supabase CLI project is
-- available.
--
-- WHAT WAS ACTUALLY VERIFIED (raw SQL, not pgTAP): this file's five
-- assertions below were hand-run as equivalent raw INSERT statements under
-- `set session role authenticated` with the matching JWT claims, against a
-- brand-new throwaway local Postgres 17 cluster (own initdb, own scratch
-- port -- not the shared Laragon instance, no existing credentials needed
-- or touched), with a hand-rolled stand-in for the roles/auth.jwt()/
-- auth.uid()/default-privileges the real Supabase platform bootstrap
-- normally provides (same approach 0006/0007/0008 documented).
--   - PRE-FIX (0001-0008 applied, 0009 NOT applied): all three exploit
--     inserts below (assertions 1-3) SUCCEEDED (`INSERT 0 1`, no error) --
--     confirmed the vulnerability was real, not theoretical.
--   - POST-FIX (0001-0009 applied): the identical three exploit inserts
--     each failed with `ERROR: new row violates row-level security policy
--     for table "connection_requests"` (assertions 1-3 below), while both
--     legitimate flows (assertions 4-5) succeeded unchanged.

begin;
select plan(7);

-- ---------------------------------------------------------------------------
-- Fixtures (as table owner — bypasses RLS)
-- ---------------------------------------------------------------------------
insert into public.tenants (id, name) values
  ('a0000000-0000-0000-0000-00000000000a', 'Tenant A (attacker/requester)'),
  ('20000000-0000-0000-0000-000000000002', 'Tenant Z (uninvolved victim)'),
  ('30000000-0000-0000-0000-000000000003', 'Tenant W (unrelated vehicle owner)'),
  ('40000000-0000-0000-0000-000000000004', 'Tenant S (real searcher/owner)'),
  ('50000000-0000-0000-0000-000000000005', 'Tenant T (genuinely fanned-in responder)'),
  ('60000000-0000-0000-0000-000000000006', 'Tenant X (not fanned in, search_match attacker)'),
  ('70000000-0000-0000-0000-000000000007', 'Tenant Z2 (legit vehicle_interest recipient)');

insert into public.tenant_users_access (tenant_id, user_id, granted, granted_at) values
  ('a0000000-0000-0000-0000-00000000000a', 'aaaaaaaa-0000-0000-0000-00000000000a', true, now()),
  ('50000000-0000-0000-0000-000000000005', 'aaaaaaaa-0000-0000-0000-000000000005', true, now()),
  ('60000000-0000-0000-0000-000000000006', 'aaaaaaaa-0000-0000-0000-000000000006', true, now());
-- NOTE: tenant Z ('20000000-...-002') deliberately has NO tenant_users_access
-- row -- used below (assertion 7) as a "module enabled but no network access
-- grant" caller.

-- Vehicle owned by tenant W — unrelated to the fabricated recipient Z.
insert into public.vehicle_snapshots (id, tenant_id, make, model) values
  ('11110000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000003', 'Toyota', 'Corolla');

-- Vehicle genuinely owned by tenant Z2 — used for the legitimate flow.
insert into public.vehicle_snapshots (id, tenant_id, make, model) values
  ('11110000-0000-0000-0000-000000000002', '70000000-0000-0000-0000-000000000007', 'Honda', 'Civic');

-- search_requests owned by tenant S.
insert into public.search_requests (id, tenant_id, requested_by, criteria) values
  ('22220000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000004',
   'aaaaaaaa-0000-0000-0000-000000000004', '{"make":"Toyota"}'::jsonb);

-- Only tenant T is genuinely fanned into that search. Tenant X is
-- deliberately NOT fanned in.
insert into public.search_request_targets (search_request_id, target_tenant_id) values
  ('22220000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000005');

-- ---------------------------------------------------------------------------
-- Assertion 1 — vehicle_interest EXPLOIT: vehicle belongs to W, claimed
-- recipient is uninvolved Z. Must be rejected.
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', 'aaaaaaaa-0000-0000-0000-00000000000a',
                     'tenant_id', 'a0000000-0000-0000-0000-00000000000a',
                     'red_aliados_enabled', true)::text, true);
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-00000000000a', true);

select throws_ok(
  $$ insert into public.connection_requests
       (requester_tenant_id, recipient_tenant_id, origin_type, vehicle_snapshot_id, requested_by)
     values
       ('a0000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-000000000002',
        'vehicle_interest', '11110000-0000-0000-0000-000000000001',
        'aaaaaaaa-0000-0000-0000-00000000000a') $$,
  '42501',
  null,
  'vehicle_interest naming an uninvolved recipient (vehicle belongs to a third tenant) is rejected'
);

-- ---------------------------------------------------------------------------
-- Assertion 2 — search_match EXPLOIT: tenant X never fanned into SR1, claims
-- the search's real owner S as recipient. Must be rejected.
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims',
  json_build_object('sub', 'aaaaaaaa-0000-0000-0000-000000000006',
                     'tenant_id', '60000000-0000-0000-0000-000000000006',
                     'red_aliados_enabled', true)::text, true);
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000006', true);

select throws_ok(
  $$ insert into public.connection_requests
       (requester_tenant_id, recipient_tenant_id, origin_type, search_request_id, requested_by)
     values
       ('60000000-0000-0000-0000-000000000006', '40000000-0000-0000-0000-000000000004',
        'search_match', '22220000-0000-0000-0000-000000000001',
        'aaaaaaaa-0000-0000-0000-000000000006') $$,
  '42501',
  null,
  'search_match from a tenant never fanned into the search is rejected, even naming the real owner'
);

-- ---------------------------------------------------------------------------
-- Assertion 3 — search_match EXPLOIT VARIANT: tenant T IS genuinely fanned
-- in, but fabricates a recipient that is NOT the search's real owner S.
-- Must be rejected.
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims',
  json_build_object('sub', 'aaaaaaaa-0000-0000-0000-000000000005',
                     'tenant_id', '50000000-0000-0000-0000-000000000005',
                     'red_aliados_enabled', true)::text, true);
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000005', true);

select throws_ok(
  $$ insert into public.connection_requests
       (requester_tenant_id, recipient_tenant_id, origin_type, search_request_id, requested_by)
     values
       ('50000000-0000-0000-0000-000000000005', '20000000-0000-0000-0000-000000000002',
        'search_match', '22220000-0000-0000-0000-000000000001',
        'aaaaaaaa-0000-0000-0000-000000000005') $$,
  '42501',
  null,
  'search_match from a genuinely fanned-in tenant naming a fabricated (non-owner) recipient is rejected'
);

-- ---------------------------------------------------------------------------
-- Assertion 4 (LEGITIMATE) — vehicle_interest where the vehicle genuinely
-- belongs to the stated recipient Z2. Must still succeed.
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims',
  json_build_object('sub', 'aaaaaaaa-0000-0000-0000-00000000000a',
                     'tenant_id', 'a0000000-0000-0000-0000-00000000000a',
                     'red_aliados_enabled', true)::text, true);
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-00000000000a', true);

select lives_ok(
  $$ insert into public.connection_requests
       (requester_tenant_id, recipient_tenant_id, origin_type, vehicle_snapshot_id, requested_by)
     values
       ('a0000000-0000-0000-0000-00000000000a', '70000000-0000-0000-0000-000000000007',
        'vehicle_interest', '11110000-0000-0000-0000-000000000002',
        'aaaaaaaa-0000-0000-0000-00000000000a') $$,
  'a genuine vehicle_interest request (recipient truly owns the referenced vehicle) still succeeds'
);

-- ---------------------------------------------------------------------------
-- Assertion 5 (LEGITIMATE) — search_match where tenant T is genuinely
-- fanned in and the recipient is the search's real owner S. Must succeed.
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims',
  json_build_object('sub', 'aaaaaaaa-0000-0000-0000-000000000005',
                     'tenant_id', '50000000-0000-0000-0000-000000000005',
                     'red_aliados_enabled', true)::text, true);
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000005', true);

select lives_ok(
  $$ insert into public.connection_requests
       (requester_tenant_id, recipient_tenant_id, origin_type, search_request_id, requested_by)
     values
       ('50000000-0000-0000-0000-000000000005', '40000000-0000-0000-0000-000000000004',
        'search_match', '22220000-0000-0000-0000-000000000001',
        'aaaaaaaa-0000-0000-0000-000000000005') $$,
  'a genuine search_match response (responder truly fanned in, recipient truly owns the search) still succeeds'
);

-- ---------------------------------------------------------------------------
-- Assertion 6 (ORACLE GATING) — direct RPC call to the helper with the
-- module DISABLED, naming a target pair with a genuinely TRUE relationship
-- (vehicle 11110000-...-0002 truly belongs to tenant Z2). Must return false
-- immediately -- proves the gate runs BEFORE the real relationship check,
-- not just alongside it.
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims',
  json_build_object('sub', 'aaaaaaaa-0000-0000-0000-00000000000a',
                     'tenant_id', 'a0000000-0000-0000-0000-00000000000a',
                     'red_aliados_enabled', false)::text, true);
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-00000000000a', true);

select is(
  app.vehicle_snapshot_owned_by(
    '11110000-0000-0000-0000-000000000002'::uuid,
    '70000000-0000-0000-0000-000000000007'::uuid
  ),
  false,
  'app.vehicle_snapshot_owned_by() returns false immediately when module_enabled() is false, even for a genuinely true relationship (direct-RPC oracle closed)'
);

-- ---------------------------------------------------------------------------
-- Assertion 7 (ORACLE GATING) — direct RPC call to the helper as tenant Z,
-- module ENABLED but with NO network-access grant, naming a target pair with
-- a genuinely TRUE relationship (tenant T truly fanned into search SR1,
-- tenant S truly owns it). Must return false immediately.
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims',
  json_build_object('sub', 'aaaaaaaa-0000-0000-0000-000000000002',
                     'tenant_id', '20000000-0000-0000-0000-000000000002',
                     'red_aliados_enabled', true)::text, true);
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000002', true);

select is(
  app.search_match_provenance_valid(
    '22220000-0000-0000-0000-000000000001'::uuid,
    '50000000-0000-0000-0000-000000000005'::uuid,
    '40000000-0000-0000-0000-000000000004'::uuid
  ),
  false,
  'app.search_match_provenance_valid() returns false immediately when has_network_access() is false, even for a genuinely true relationship (direct-RPC oracle closed)'
);

select * from finish();
rollback;
