-- 0008_reputation_events_trigger.sql
-- Phase 7 (PR7): partner-reputation's Response Events Recorded requirement --
-- "The system MUST record a response event (accepted, rejected, or expired)
-- with response time for every terminal connection_request outcome."
--
-- Fires only for a genuine `pending -> accepted|rejected|expired` transition
-- -- NEVER for `status = 'suggested'` rows and NEVER for the
-- `suggested -> pending` "Engage" promotion PR6 introduced (network-
-- connections: "A suggested request MUST NOT expire and MUST NOT emit
-- reputation_events"). This does not modify, replace, or duplicate 0006's
-- `app.handle_connection_request_transition` trigger (state-machine
-- validation + reciprocal connection_edges creation) -- that trigger already
-- decides whether an UPDATE is legal at all; this one is a separate AFTER
-- UPDATE observer that only reacts to an already-validated, already-
-- committed-within-the-same-statement status change and records the
-- observable outcome. Postgres runs all BEFORE row triggers first (0006),
-- then all AFTER row triggers (this one) against the final NEW row 0006
-- produced (its server-stamped responded_at included) -- see
-- https://www.postgresql.org/docs/current/trigger-definition.html.
--
-- SECURITY (adversarial review per PR6's forged-edge lesson, applied here
-- deliberately):
--   1. WHEN clause scoping: restricted to exactly
--      `old.status = 'pending' and new.status in ('accepted','rejected','expired')`.
--      Unlike 0006's original pre-fix bug (a narrow WHEN clause meant a
--      malicious UPDATE that changed OTHER columns without changing status
--      skipped VALIDATION entirely), this trigger performs no validation and
--      no writes back to connection_requests -- it only ever produces an
--      INSERT into reputation_events, so a narrower WHEN clause here carries
--      no equivalent exploit risk: at worst a missed guard could produce a
--      missing event, never a forged one. The function body ALSO re-checks
--      old.status/new.status explicitly (defense in depth) so the guard
--      holds even if a future migration widens or drops the WHEN clause.
--   2. Duplicate-insert guard: `reputation_events` already has
--      UNIQUE(connection_request_id) (0001) -- this trigger's INSERT uses
--      `ON CONFLICT (connection_request_id) DO NOTHING`, so even a
--      hypothetical re-fire (e.g. a future migration relaxing 0006's
--      terminal-state no-outgoing-transition rule) cannot produce more than
--      one row per request.
--   3. Tamper-resistant response_time_seconds: a client cannot smuggle an
--      arbitrary elapsed time. `created_at`/`expires_at`/`responded_at` are
--      NOT in 0007's column-scoped GRANT UPDATE (status, responded_by only)
--      -- a client-issued UPDATE touching them fails with permission denied
--      before either trigger runs. `responded_at` is always server-computed
--      by 0006 (`coalesce(new.responded_at, now())`), never client-supplied.
--   4. Belt-and-suspenders grant hygiene (same lesson as
--      0007_fix_connection_request_update_grant.sql): `reputation_events`
--      already has zero INSERT/UPDATE/DELETE RLS policy for `authenticated`
--      (0003's select_reputation_events is SELECT-only) -- RLS-enabled +
--      zero policy for a command = that command is denied for that role
--      regardless of any underlying table-wide GRANT `authenticated` may
--      hold from Supabase's default per-schema bootstrap privileges (the
--      exact class of implicit grant that caused PR6's exploit). This
--      migration explicitly revokes INSERT/UPDATE/DELETE anyway so the deny
--      does not rely on RLS alone being correctly configured in perpetuity
--      -- if RLS were ever accidentally disabled on this table, the
--      GRANT-level revoke still holds. Only the trigger's SECURITY DEFINER
--      function (owned by the migration-running role, never `authenticated`)
--      can write this table.
--
-- response_time_seconds anchor: measured from when the request actually
-- entered `pending` -- back-derived as `expires_at - interval '48 hours'`
-- (expires_at is always stamped as pending-start + 48h by 0006, for both a
-- freshly-suggested->pending promotion and, when set, a directly-created
-- pending row), falling back to `created_at` when `expires_at` is null.
-- KNOWN GAP (not fixed here -- out of this PR's scope, which may not
-- hand-edit 0001-0007): a `connection_requests` row created directly as
-- `pending` (origin `vehicle_interest`/`search_match`, never through
-- `suggested`) currently gets `expires_at = null` at INSERT time, because
-- only the `suggested -> pending` branch of 0006's BEFORE UPDATE trigger
-- stamps `expires_at` -- there is no BEFORE INSERT trigger doing the same
-- for a row that is `pending` from creation. The `created_at` fallback below
-- means such a row's response_time_seconds is still measured correctly
-- (created_at IS the pending-start instant for that row shape), so this
-- trigger's own output is correct today regardless of that gap; it is
-- flagged here only because the *pg_cron auto-expiry sweep* (0006 PART B,
-- itself not yet executed pending pg_cron/pg_net availability) depends on
-- expires_at being non-null to ever select such a row. First action for
-- whoever revisits network-connections: add expires_at stamping to a BEFORE
-- INSERT trigger (or a column default computed at insert) for directly
-- created pending rows.
--
-- Verified for real against a disposable local Postgres 17 database
-- (Laragon, localhost:5432) with the same hand-rolled auth.uid()/auth.jwt()/
-- role stand-in PR6 used: confirmed (1) an INSERT of a `suggested` row
-- emits zero reputation_events, (2) promoting that row to `pending`
-- (Engage) emits zero reputation_events, (3) `pending -> accepted`,
-- `pending -> rejected`, and `pending -> expired` (simulating the pg_cron
-- sweep with a direct UPDATE, since pg_cron itself is unavailable in this
-- sandbox) each emit exactly one reputation_events row with the expected
-- event_type, and an expired vs. a rejected request with identical elapsed
-- time produce response_time_seconds values that, once run through
-- features/partner-reputation/domain's computeReputationScore, diverge with
-- the expired tenant scoring lower, and (4) a direct `INSERT INTO
-- reputation_events ...` attempted as `authenticated` is rejected by RLS
-- (`new row violates row-level security policy`), confirming client writes
-- are impossible even before considering the trigger's own SECURITY
-- DEFINER-only write path.

revoke insert, update, delete on public.reputation_events from authenticated;

create or replace function app.emit_reputation_event()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  pending_started_at timestamptz;
begin
  -- Defense in depth beyond the WHEN clause (see file header point 1): only
  -- a genuine pending -> terminal transition emits an event. Never fires for
  -- status = 'suggested' rows (they cannot reach a terminal status directly
  -- -- 0006's own state machine only allows suggested -> pending -- but this
  -- guard holds even if that invariant is ever relaxed) and never for the
  -- suggested -> pending promotion itself ('pending' is not in the terminal
  -- set checked below).
  if old.status is distinct from 'pending' then
    return new;
  end if;

  if new.status not in ('accepted', 'rejected', 'expired') then
    return new;
  end if;

  pending_started_at := coalesce(old.expires_at - interval '48 hours', old.created_at);

  insert into public.reputation_events (
    tenant_id, connection_request_id, event_type, response_time_seconds
  )
  values (
    new.recipient_tenant_id,
    new.id,
    new.status,
    greatest(
      extract(epoch from (coalesce(new.responded_at, now()) - pending_started_at))::bigint,
      0
    )
  )
  on conflict (connection_request_id) do nothing;

  return new;
end;
$$;

comment on function app.emit_reputation_event() is
  'AFTER UPDATE trigger on connection_requests: emits exactly one reputation_events row when a pending request reaches a terminal outcome (accepted/rejected/expired). Never fires for suggested rows or the suggested->pending promotion. SECURITY DEFINER because reputation_events has no INSERT policy for authenticated (0003) -- this trigger is the only writer, mirroring 0006''s relationship to connection_edges.';

drop trigger if exists emit_reputation_event on public.connection_requests;

create trigger emit_reputation_event
  after update on public.connection_requests
  for each row
  when (old.status = 'pending' and new.status in ('accepted', 'rejected', 'expired'))
  execute function app.emit_reputation_event();
