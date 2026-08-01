-- 0005_pg_cron_reconcile.sql
-- Phase 4 (PR4): schedule reconcile-outbox (spec: vehicle-sync
-- "Reconciliation Backstop") every 15 minutes.
--
-- WHAT THIS DOES AND WHY:
--
-- pg_cron only runs SQL on a schedule — it cannot itself call an HTTP
-- endpoint (an Edge Function is deployed and invoked over HTTP, not SQL).
-- The Supabase-idiomatic way to bridge that gap is `pg_cron` scheduling a
-- job whose body calls `net.http_post(...)` (the `pg_net` extension, which
-- ships with every Supabase Postgres image and performs the actual async
-- HTTP call from inside Postgres). This is the standard, documented
-- Supabase pattern for "cron-trigger an Edge Function" — there is no more
-- direct SQL-only mechanism.
--
-- Secrets/URL handling: this migration does NOT hardcode a project URL or
-- service-role/reconcile secret (no live red-aliados Supabase project
-- exists yet — same situation as supabase/THIRD_PARTY_AUTH.md from PR2).
-- Instead it reads two Postgres-level custom settings (GUCs) that MUST be
-- configured once a real project exists:
--
--   alter database postgres set app.settings.functions_base_url =
--     'https://<project-ref>.supabase.co/functions/v1';
--   alter database postgres set app.settings.reconcile_outbox_secret =
--     '<same value as the RECONCILE_OUTBOX_SECRET function env var>';
--
-- A GUC (rather than Vault) is used here because it's the minimal pattern
-- that is fully expressible and reviewable in a plain migration file
-- without requiring a live Vault API round-trip at migration time. For a
-- production hardening pass, moving `reconcile_outbox_secret` into
-- Supabase Vault (`vault.create_secret` + `vault.decrypted_secrets`) and
-- referencing it from the cron job body is the recommended next step —
-- explicitly flagged here, not silently done, since Vault's exact API
-- could not be verified against a running project in this sandbox either.
--
-- NOT EXECUTED: this migration was NOT run against any Postgres instance —
-- no Docker/Supabase CLI (`supabase start`) and no `pg_cron`/`pg_net`
-- extension binaries are available in this sandbox (unlike PR1, which had
-- a throwaway local Postgres 17 available for its 4 migrations — that
-- Postgres install does not have pg_cron/pg_net compiled in, so this
-- migration cannot be verified the same way). Verify by running
-- `supabase db reset` (or `supabase start` + `supabase migration up`)
-- against a real Supabase CLI project once available, then
-- `select * from cron.job;` to confirm the schedule registered.

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

select
  cron.schedule(
    'reconcile-outbox-every-15-minutes',
    '*/15 * * * *',
    $$
    select
      net.http_post(
        url := current_setting('app.settings.functions_base_url', true) || '/reconcile-outbox',
        headers := jsonb_build_object(
          'Authorization', 'Bearer ' || current_setting('app.settings.reconcile_outbox_secret', true),
          'Content-Type', 'application/json'
        ),
        body := '{}'::jsonb
      );
    $$
  );

comment on extension pg_cron is
  'Schedules reconcile-outbox (vehicle-sync: Reconciliation Backstop) every 15 minutes via pg_net.http_post. See file header for required app.settings.* GUCs.';
