-- 0002_app_helpers.sql
-- Phase 1 (PR1): the `app.*` SQL helper functions — the single enforcement
-- point for every visibility rule in this system (see design.md: "four
-- permission layers as composable SQL"). RLS policies (0003) and
-- vehicle_snapshots_public (0004) both compose these; nothing re-derives the
-- logic independently.
--
-- All functions are `security definer` so they can read RLS-protected tables
-- (tenant_users_access, connection_edges, connection_requests) regardless of
-- the calling role's own row visibility — they ARE the visibility gate, so
-- they must see the raw truth to compute it. Each pins `search_path` to guard
-- against search_path hijacking, per Postgres SECURITY DEFINER best practice.

-- =============================================================================
-- Layer 1: module enabled — from the V2-issued JWT claim, never a local table
-- =============================================================================
create or replace function app.module_enabled()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((auth.jwt() ->> 'red_aliados_enabled')::boolean, false);
$$;

comment on function app.module_enabled() is
  'Layer 1 (cheapest fail, first conjunct everywhere): is the module enabled for the caller''s tenant, per JWT claim red_aliados_enabled?';

-- =============================================================================
-- Current tenant — derived from the JWT claim, not a session table
-- =============================================================================
create or replace function app.current_tenant_id()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select (auth.jwt() ->> 'tenant_id')::uuid;
$$;

comment on function app.current_tenant_id() is
  'The caller''s tenant, derived exclusively from the JWT tenant_id claim (identity-bridge: Claim Contract). Null if the claim is absent.';

-- =============================================================================
-- Layer 3: has this user been granted network access by their tenant admin?
-- =============================================================================
create or replace function app.has_network_access()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.tenant_users_access a
    where a.tenant_id = app.current_tenant_id()
      and a.user_id = auth.uid()
      and a.granted = true
      and a.revoked_at is null
  );
$$;

comment on function app.has_network_access() is
  'Layer 3: does auth.uid(), within app.current_tenant_id(), have an active network-access grant?';

-- =============================================================================
-- Layer 2: active mutual connection to a target tenant
-- =============================================================================
create or replace function app.is_connected(target_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.connection_edges e
    where e.viewer_tenant_id = app.current_tenant_id()
      and e.visible_tenant_id = target_tenant_id
      and e.revoked_at is null
  );
$$;

comment on function app.is_connected(uuid) is
  'Layer 2: is there an active (non-revoked) connection_edges row from the caller''s tenant to target_tenant_id?';

-- =============================================================================
-- Internal helper for the `candidate` tier: masked pre-connection visibility
-- =============================================================================
create or replace function app.has_candidate_link(target_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.connection_requests r
    where r.status in ('suggested', 'pending')
      and (
        (r.requester_tenant_id = app.current_tenant_id() and r.recipient_tenant_id = target_tenant_id)
        or
        (r.requester_tenant_id = target_tenant_id and r.recipient_tenant_id = app.current_tenant_id())
      )
  );
$$;

comment on function app.has_candidate_link(uuid) is
  'Internal helper composed by app.visibility_tier(): is the caller''s tenant linked to target_tenant_id by a suggested/pending connection_requests row (network-connections: Candidate Visibility Tier)?';

-- =============================================================================
-- The composed enforcement point: 'owner' | 'connected' | 'candidate' | 'none'
-- =============================================================================
create or replace function app.visibility_tier(target_tenant_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  -- Layer 1 first, always — cheapest fail, and nothing is visible at all
  -- (not even the caller's own data) when the module is disabled.
  if not app.module_enabled() then
    return 'none';
  end if;

  -- A tenant always sees its own data once the module is enabled, independent
  -- of layer 3 (network access gates visibility into OTHER tenants' data).
  if target_tenant_id = app.current_tenant_id() then
    return 'owner';
  end if;

  -- Layer 3: no cross-tenant visibility at all without a granted network user.
  if not app.has_network_access() then
    return 'none';
  end if;

  -- Layer 2: an active edge is the strongest cross-tenant tier.
  if app.is_connected(target_tenant_id) then
    return 'connected';
  end if;

  -- Pre-connection: masked visibility while linked by a suggested/pending request.
  if app.has_candidate_link(target_tenant_id) then
    return 'candidate';
  end if;

  return 'none';
end;
$$;

comment on function app.visibility_tier(uuid) is
  'Single enforcement point composing layers 1-3 into one of owner|connected|candidate|none for a given target tenant. RLS policies (0003) and vehicle_snapshots_public (0004) both call this instead of re-deriving the logic.';

-- =============================================================================
-- Resource-scoped helper: is a given vehicle_snapshots row visible to the caller?
--
-- Needed because 0004_public_views.sql revokes SELECT on public.vehicle_snapshots
-- from `authenticated` (reads must go through vehicle_snapshots_public). Any RLS
-- policy on ANOTHER table (e.g. vehicle_snapshot_photos) that needs to know
-- "is this vehicle visible to me" cannot do a raw subquery against
-- vehicle_snapshots anymore — that subquery would hit the same revoked grant.
-- This SECURITY DEFINER function reads vehicle_snapshots with the function
-- owner's privileges, sidestepping that revoke, exactly like the layer helpers
-- above do for tenant_users_access/connection_edges/connection_requests.
-- =============================================================================
create or replace function app.vehicle_snapshot_visible(target_vehicle_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.vehicle_snapshots v
    where v.id = target_vehicle_id
      and app.visibility_tier(v.tenant_id) <> 'none'
  );
$$;

comment on function app.vehicle_snapshot_visible(uuid) is
  'Is target_vehicle_id visible to the caller (visibility_tier <> none)? Lets other tables'' RLS policies (e.g. vehicle_snapshot_photos) check vehicle visibility without needing their own SELECT grant on the (deliberately revoked) vehicle_snapshots base table.';

-- =============================================================================
-- Grants: authenticated callers only, never anon/public
-- =============================================================================
-- No RLS policy or view currently depends on name-based schema lookup (all
-- reference these functions by pre-resolved OID), so this has no observed
-- blast radius today — added anyway per SECURITY DEFINER hygiene: any future
-- caller resolving `app.foo()` unqualified needs USAGE to even attempt it.
revoke usage on schema app from public;
grant usage on schema app to authenticated;

revoke execute on function app.module_enabled() from public;
revoke execute on function app.current_tenant_id() from public;
revoke execute on function app.has_network_access() from public;
revoke execute on function app.is_connected(uuid) from public;
revoke execute on function app.has_candidate_link(uuid) from public;
revoke execute on function app.visibility_tier(uuid) from public;
revoke execute on function app.vehicle_snapshot_visible(uuid) from public;

grant execute on function app.module_enabled() to authenticated;
grant execute on function app.current_tenant_id() to authenticated;
grant execute on function app.has_network_access() to authenticated;
grant execute on function app.is_connected(uuid) to authenticated;
grant execute on function app.has_candidate_link(uuid) to authenticated;
grant execute on function app.visibility_tier(uuid) to authenticated;
grant execute on function app.vehicle_snapshot_visible(uuid) to authenticated;
