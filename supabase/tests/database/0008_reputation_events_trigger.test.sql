-- pgTAP: 0008_reputation_events_trigger.sql — partner-reputation's Response
-- Events Recorded requirement (accepted/rejected/expired only, never
-- suggested or the suggested->pending promotion).
--
-- NOT EXECUTED AS PGTAP in the apply sandbox: `select * from
-- pg_available_extensions where name = 'pgtap';` returns zero rows on the
-- local Postgres 17 install used here (same documented gap PR1/PR3/PR4/PR5/
-- PR6 hit) — there is no pgTAP binary to load. Run via `supabase test db`
-- (pg_prove) once a real Supabase CLI project is available.
--
-- WHAT WAS ACTUALLY VERIFIED (raw SQL, not pgTAP, against a disposable local
-- Postgres 17 database at localhost:5432 — created, exercised, then
-- dropped), with the same hand-rolled auth.uid()/auth.jwt()/role stand-in
-- PR6 used: every assertion below was hand-run as an equivalent raw
-- `update`/`insert`/`select` under `set local role authenticated` with the
-- matching JWT claims, plus 0001-0004+0006(PART A only, PART B's pg_cron
-- extension is unavailable in this sandbox, same as 0005/0006)+0007 applied
-- first. Results:
--   - pending -> accepted / pending -> rejected / pending -> expired
--     (simulating the pg_cron sweep with the sweep's own UPDATE shape) each
--     produced exactly one reputation_events row with the matching
--     event_type.
--   - A freshly-inserted `suggested` row produced zero reputation_events
--     rows.
--   - Promoting that `suggested` row to `pending` (the "Engage" action)
--     produced zero reputation_events rows (expires_at was stamped by
--     0006's own trigger, confirming the promotion itself is silent).
--   - That same row, once later swept to `expired`, THEN produced exactly
--     one reputation_events row — confirming only the promotion step itself
--     is silent, not the request's entire subsequent lifecycle.
--   - Two requests with an IDENTICAL 48h elapsed window, one rejected and
--     one expired, both recorded response_time_seconds = 172800 (48h in
--     seconds) — proving the divergence in
--     features/partner-reputation/domain's computeReputationScore comes
--     from event_type, not a smuggled time difference, satisfying the
--     "equivalent context" framing in the spec scenario.
--   - A direct `authenticated` INSERT into reputation_events was rejected
--     with `permission denied for table reputation_events` (SQLSTATE 42501)
--     — this migration's own `revoke insert, update, delete ... from
--     authenticated` layer. With that revoke temporarily removed (simulating
--     a future regression), the identical INSERT was still rejected, this
--     time by RLS itself (`new row violates row-level security policy`,
--     also 42501) — confirming both defense-in-depth layers hold
--     independently, mirroring 0007's own two-layer proof for
--     connection_requests.

begin;
select plan(7);

-- ---------------------------------------------------------------------------
-- Fixtures (as table owner — bypasses RLS)
-- ---------------------------------------------------------------------------
insert into public.tenants (id, name) values
  ('11111111-1111-1111-1111-111111111111', 'Tenant A (requester)'),
  ('22222222-2222-2222-2222-222222222222', 'Tenant B (accepts)'),
  ('33333333-3333-3333-3333-333333333333', 'Tenant C (rejects)'),
  ('55555555-5555-5555-5555-555555555555', 'Tenant E (seeded pair)'),
  ('66666666-6666-6666-6666-666666666666', 'Tenant F (seeded pair)');

insert into public.tenant_users_access (tenant_id, user_id, granted, granted_at) values
  ('22222222-2222-2222-2222-222222222222', 'bbbbbbbb-0000-0000-0000-000000000002', true, now()),
  ('33333333-3333-3333-3333-333333333333', 'cccccccc-0000-0000-0000-000000000003', true, now()),
  ('66666666-6666-6666-6666-666666666666', 'ffffffff-0000-0000-0000-000000000006', true, now());

insert into public.connection_requests
  (id, requester_tenant_id, recipient_tenant_id, origin_type, status, expires_at)
values
  ('a0000000-0000-0000-0000-00000000000a', '11111111-1111-1111-1111-111111111111',
   '22222222-2222-2222-2222-222222222222', 'vehicle_interest', 'pending', now() + interval '48 hours'),
  ('b0000000-0000-0000-0000-00000000000b', '11111111-1111-1111-1111-111111111111',
   '33333333-3333-3333-3333-333333333333', 'vehicle_interest', 'pending', now() + interval '48 hours');

insert into public.connection_requests
  (id, requester_tenant_id, recipient_tenant_id, origin_type, status, seeded_by)
values
  ('d0000000-0000-0000-0000-00000000000d', '55555555-5555-5555-5555-555555555555',
   '66666666-6666-6666-6666-666666666666', 'direct', 'suggested', 'operator-avaluauto');

-- ---------------------------------------------------------------------------
-- Assertion 1: accepting a pending request emits exactly one 'accepted' event
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', 'bbbbbbbb-0000-0000-0000-000000000002',
                     'tenant_id', '22222222-2222-2222-2222-222222222222',
                     'red_aliados_enabled', true)::text, true);
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-0000-0000-000000000002', true);
update public.connection_requests
set status = 'accepted', responded_by = 'bbbbbbbb-0000-0000-0000-000000000002'
where id = 'a0000000-0000-0000-0000-00000000000a';
reset role;

select results_eq(
  $$ select event_type from public.reputation_events where connection_request_id = 'a0000000-0000-0000-0000-00000000000a' $$,
  $$ values ('accepted'::text) $$,
  'accepting a pending request emits exactly one accepted reputation_events row'
);

-- ---------------------------------------------------------------------------
-- Assertion 2: rejecting a pending request emits exactly one 'rejected' event
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', 'cccccccc-0000-0000-0000-000000000003',
                     'tenant_id', '33333333-3333-3333-3333-333333333333',
                     'red_aliados_enabled', true)::text, true);
select set_config('request.jwt.claim.sub', 'cccccccc-0000-0000-0000-000000000003', true);
update public.connection_requests
set status = 'rejected', responded_by = 'cccccccc-0000-0000-0000-000000000003'
where id = 'b0000000-0000-0000-0000-00000000000b';
reset role;

select results_eq(
  $$ select event_type from public.reputation_events where connection_request_id = 'b0000000-0000-0000-0000-00000000000b' $$,
  $$ values ('rejected'::text) $$,
  'rejecting a pending request emits exactly one rejected reputation_events row'
);

-- ---------------------------------------------------------------------------
-- Assertion 3: a freshly-seeded suggested row emits nothing
-- ---------------------------------------------------------------------------
select is_empty(
  $$ select 1 from public.reputation_events where connection_request_id = 'd0000000-0000-0000-0000-00000000000d' $$,
  'a suggested-status row has zero reputation_events'
);

-- ---------------------------------------------------------------------------
-- Assertion 4: the suggested -> pending "Engage" promotion is silent
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', 'ffffffff-0000-0000-0000-000000000006',
                     'tenant_id', '66666666-6666-6666-6666-666666666666',
                     'red_aliados_enabled', true)::text, true);
select set_config('request.jwt.claim.sub', 'ffffffff-0000-0000-0000-000000000006', true);
update public.connection_requests set status = 'pending' where id = 'd0000000-0000-0000-0000-00000000000d';
reset role;

select is_empty(
  $$ select 1 from public.reputation_events where connection_request_id = 'd0000000-0000-0000-0000-00000000000d' $$,
  'the suggested->pending Engage promotion itself emits zero reputation_events'
);

-- ---------------------------------------------------------------------------
-- Assertion 5: that same row, once it later reaches a terminal state, DOES
-- emit an event — only the promotion step is silent, not the whole lifecycle
-- ---------------------------------------------------------------------------
update public.connection_requests
set status = 'expired'
where id = 'd0000000-0000-0000-0000-00000000000d' and status = 'pending';

select results_eq(
  $$ select event_type from public.reputation_events where connection_request_id = 'd0000000-0000-0000-0000-00000000000d' $$,
  $$ values ('expired'::text) $$,
  'a previously-suggested row that later expires emits exactly one expired reputation_events row'
);

-- ---------------------------------------------------------------------------
-- Assertion 6: a direct authenticated INSERT is rejected (this migration's
-- own grant revoke — the primary layer; RLS is the independent second layer,
-- proven separately in this file's own header notes since throws_ok only
-- asserts one SQLSTATE per call and both layers happen to raise 42501)
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', 'bbbbbbbb-0000-0000-0000-000000000002',
                     'tenant_id', '22222222-2222-2222-2222-222222222222',
                     'red_aliados_enabled', true)::text, true);
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-0000-0000-000000000002', true);
select throws_ok(
  $$ insert into public.reputation_events (tenant_id, connection_request_id, event_type, response_time_seconds)
     values ('22222222-2222-2222-2222-222222222222', 'a0000000-0000-0000-0000-00000000000a', 'accepted', 0) $$,
  '42501',
  null,
  'a directly authenticated client cannot INSERT into reputation_events'
);
reset role;

-- ---------------------------------------------------------------------------
-- Assertion 7: UNIQUE(connection_request_id) + ON CONFLICT DO NOTHING means
-- a hypothetical re-fire cannot duplicate an event (0001's own constraint,
-- exercised here via a direct owner-role insert attempt matching an
-- already-recorded request).
-- ---------------------------------------------------------------------------
select lives_ok(
  $$ insert into public.reputation_events (tenant_id, connection_request_id, event_type, response_time_seconds)
     values ('22222222-2222-2222-2222-222222222222', 'a0000000-0000-0000-0000-00000000000a', 'accepted', 999)
     on conflict (connection_request_id) do nothing $$,
  'a conflicting insert for an already-recorded request is a silent no-op, never a duplicate'
);

select * from finish();
rollback;
