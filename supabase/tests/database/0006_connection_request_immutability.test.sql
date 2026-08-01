-- pgTAP: 0006_pg_cron_expire_requests.sql (as fixed by
-- 0007_fix_connection_request_update_grant.sql) — regression test for the
-- forged-edge exploit found in post-merge-review.
--
-- Exploit this guards against: a malicious recipient tenant B retargets an
-- inbound connection_requests row's requester_tenant_id to an uninvolved
-- victim tenant Z (status left unchanged, so the original narrow trigger
-- never fired), then accepts the request -- forging a mutual
-- connection_edges pair between B and Z with zero consent from either the
-- real requester A or Z. Fixed with two independent layers:
--   1. 0007's column-scoped UPDATE grant (status, responded_by only) --
--      `permission denied for table connection_requests` before the
--      trigger even runs.
--   2. This migration's widened trigger (fires unconditionally, no WHEN
--      clause) with an explicit identity-column immutability check --
--      holds even if a future migration accidentally re-widens the grant.
--
-- Fixture setup runs as the table-owning role (bypasses RLS). Assertions
-- run `set local role authenticated` with JWT claims faked via
-- request.jwt.claims / request.jwt.claim.sub — see 0002's test file header
-- for the same assumption.
--
-- NOT EXECUTED AS PGTAP in the apply sandbox: `select * from
-- pg_available_extensions where name = 'pgtap';` returns zero rows on the
-- local Postgres 17 install used here (same documented gap PR1/PR3/PR4/PR5
-- hit) -- there is no pgTAP binary to load. Run via `supabase test db`
-- (pg_prove) once a real Supabase CLI project is available.
--
-- WHAT WAS ACTUALLY VERIFIED (raw SQL, not pgTAP, against a disposable
-- local Postgres 17 database at localhost:5432 — created, exercised, then
-- dropped): this file's two assertions below were hand-run as equivalent
-- raw `update ... ` statements under `set local role authenticated` with
-- the same JWT claims.
--   - Pre-fix (original 0006, narrow `when (old.status is distinct from
--     new.status)` trigger, no column-scoped grant): the retarget UPDATE
--     succeeded (`UPDATE 1`) and the follow-up accept produced forged
--     reciprocal connection_edges rows between the recipient and an
--     uninvolved tenant.
--   - Post-fix (this migration + 0007 applied): the identical retarget
--     UPDATE failed with `ERROR: permiso denegado a la tabla
--     connection_requests` (permission denied for table
--     connection_requests, i.e. SQLSTATE 42501) — blocked at the grant
--     layer, before the trigger is even reached.
--   - Layer 2 isolation: with the grant deliberately re-widened back to a
--     blanket `grant update on public.connection_requests to authenticated`
--     (simulating a future regression of 0007), the identical retarget
--     UPDATE instead failed with the trigger's own exception: `ERROR:
--     connection_requests identity columns (requester_tenant_id,
--     origin_type, vehicle_snapshot_id, search_request_id, seeded_by) are
--     immutable after row creation` — confirming layer 2 holds
--     independently of layer 1.

begin;
select plan(3);

-- ---------------------------------------------------------------------------
-- Fixtures (as table owner — bypasses RLS)
-- ---------------------------------------------------------------------------
insert into public.tenants (id, name) values
  ('11111111-1111-1111-1111-111111111111', 'Tenant A (real requester)'),
  ('22222222-2222-2222-2222-222222222222', 'Tenant B (malicious recipient)'),
  ('55555555-5555-5555-5555-555555555555', 'Tenant Z (uninvolved victim)');

insert into public.tenant_users_access (tenant_id, user_id, granted, granted_at)
values ('22222222-2222-2222-2222-222222222222', 'bbbbbbbb-0000-0000-0000-000000000002', true, now());

insert into public.connection_requests
  (id, requester_tenant_id, recipient_tenant_id, origin_type, status, expires_at)
values
  ('e0000000-0000-0000-0000-00000000000e', '11111111-1111-1111-1111-111111111111',
   '22222222-2222-2222-2222-222222222222', 'vehicle_interest', 'pending', now() + interval '48 hours');

-- ---------------------------------------------------------------------------
-- Assertions as tenant B's (recipient) granted user
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', 'bbbbbbbb-0000-0000-0000-000000000002',
                     'tenant_id', '22222222-2222-2222-2222-222222222222',
                     'red_aliados_enabled', true)::text, true);
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-0000-0000-000000000002', true);

-- Layer 1 (0007's column-scoped grant): the recipient cannot even attempt
-- to set requester_tenant_id — permission denied before RLS/trigger run.
select throws_ok(
  $$ update public.connection_requests
     set requester_tenant_id = '55555555-5555-5555-5555-555555555555'
     where id = 'e0000000-0000-0000-0000-00000000000e' $$,
  '42501',
  null,
  'recipient cannot UPDATE connection_requests.requester_tenant_id — column-scoped grant denies it'
);

-- The row is untouched by the rejected attempt above.
select results_eq(
  $$ select requester_tenant_id from public.connection_requests
     where id = 'e0000000-0000-0000-0000-00000000000e' $$,
  $$ values ('11111111-1111-1111-1111-111111111111'::uuid) $$,
  'requester_tenant_id is unchanged after the rejected retarget attempt'
);

-- Legitimate path still works: the recipient CAN accept the untouched
-- request, producing the correct (not forged) reciprocal edges.
select lives_ok(
  $$ update public.connection_requests
     set status = 'accepted', responded_by = 'bbbbbbbb-0000-0000-0000-000000000002'
     where id = 'e0000000-0000-0000-0000-00000000000e' $$,
  'recipient CAN still accept a legitimate, untouched request (status/responded_by only)'
);

select * from finish();
rollback;
