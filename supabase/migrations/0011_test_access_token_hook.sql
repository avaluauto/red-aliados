-- 0011_test_access_token_hook.sql
-- Local/dev testing infrastructure (supabase/LOCAL_TESTING.md), added while
-- Third-Party Auth (V2 JWKS trust, supabase/THIRD_PARTY_AUTH.md) is blocked
-- on coordination with the V2 team. Lets the WHOLE app flow be exercised
-- end-to-end against this real project using Supabase's own native auth
-- (email/password sign-in) instead of a V2-issued JWT, via a Custom Access
-- Token Hook that injects the same claim shape identity-bridge already
-- expects (tenant_id, app_role, red_aliados_enabled).
--
-- Inert for real V2 traffic: Third-Party Auth tokens are verified locally
-- against V2's JWKS, never issued by this project's own GoTrue -- Auth Hooks
-- only fire for tokens THIS project's GoTrue mints (i.e. native sign-in).
-- Safe to leave in place permanently; the only thing that needs cleanup
-- later is the actual test tenant/user rows (see LOCAL_TESTING.md).
--
-- Claim key note: uses `app_role`, not `role` -- see
-- apps/web/src/features/identity-bridge/domain/session-claims.ts's header
-- comment for why (`role` is reserved by PostgREST for Postgres role
-- switching; setting it to anything but `authenticated` breaks every
-- `to authenticated` RLS policy in this project).

-- =============================================================================
-- Mapping table: which test tenant_id/app_role/red_aliados_enabled a given
-- auth.users row should get injected into its JWT. `app` schema is
-- PostgREST-exposed (supabase/config.toml), so -- same defensive posture as
-- every other app.* object touching auth-adjacent data (see 0009's header) --
-- RLS is enabled with zero policies AND grants are explicitly revoked from
-- `authenticated`/`anon`/`public`, not left to Supabase's default per-schema
-- privileges (the exact class of implicit grant that caused PR6's forged-edge
-- exploit, 0006/0007's header).
-- =============================================================================
create table app.test_identity_claims (
  user_id uuid primary key references auth.users (id) on delete cascade,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  app_role text not null,
  red_aliados_enabled boolean not null default true,
  created_at timestamptz not null default now()
);

comment on table app.test_identity_claims is
  'Local-testing only: maps a native Supabase auth.users row to the tenant_id/app_role/red_aliados_enabled claims app.custom_access_token_hook injects, standing in for a V2-issued JWT until Third-Party Auth is configured (supabase/THIRD_PARTY_AUTH.md). Delete this table and the hook once V2 integration is live -- see supabase/LOCAL_TESTING.md.';

alter table app.test_identity_claims enable row level security;
revoke all on app.test_identity_claims from authenticated, anon, public;

-- =============================================================================
-- Custom Access Token Hook: https://supabase.com/docs/guides/auth/auth-hooks/custom-access-token-hook
-- Must still be wired up in Studio (Authentication -> Hooks) -- creating this
-- function does not by itself register it with GoTrue; that toggle is not
-- exposed by any MCP tool available here, so it's a manual step
-- (LOCAL_TESTING.md). SECURITY DEFINER (owned by the migration role, which
-- has app-schema access unconditionally) because `supabase_auth_admin`, the
-- role GoTrue actually invokes this as, has no grant on schema app otherwise.
-- =============================================================================
create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, app, pg_temp
as $$
declare
  claims jsonb;
  test_row app.test_identity_claims;
begin
  claims := event -> 'claims';

  select * into test_row
  from app.test_identity_claims t
  where t.user_id = (event ->> 'user_id')::uuid;

  if found then
    claims := jsonb_set(claims, '{tenant_id}', to_jsonb(test_row.tenant_id::text));
    claims := jsonb_set(claims, '{app_role}', to_jsonb(test_row.app_role));
    claims := jsonb_set(claims, '{red_aliados_enabled}', to_jsonb(test_row.red_aliados_enabled));
  end if;

  event := jsonb_set(event, '{claims}', claims);
  return event;
end;
$$;

comment on function public.custom_access_token_hook(jsonb) is
  'Local-testing only: injects tenant_id/app_role/red_aliados_enabled into natively-issued sessions for users with a matching app.test_identity_claims row, standing in for V2''s Third-Party Auth JWT until that is configured. No-op (returns claims unchanged) for any user without a mapping row, so it is safe to leave enabled. Must be registered in Studio -> Authentication -> Hooks (not settable via any available MCP tool) -- see supabase/LOCAL_TESTING.md.';

-- PostgREST exposes `public` by default -- lock this down to only the role
-- GoTrue actually invokes it as, same rationale as 0009's RPC-oracle gating.
revoke execute on function public.custom_access_token_hook(jsonb) from authenticated, anon, public;
grant usage on schema public to supabase_auth_admin;
grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;
