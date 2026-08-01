-- 0004_public_views.sql
-- Phase 1 (PR1): vehicle_snapshots_public — the ONE read path for vehicle
-- inventory. Does row filtering AND column masking off app.visibility_tier(),
-- per design.md's "column-level masking via SECURITY DEFINER view" decision:
-- app-layer projection is bypassable (anon key + direct PostgREST call), and
-- static column GRANTs can't express "owner sees min_price, peer never does".
--
-- `security_invoker = false` (the default, stated explicitly): the view runs
-- as its OWNER, so it can read the base tables even after their SELECT grant
-- is revoked from `authenticated` below. Per-caller filtering/masking still
-- happens correctly because app.visibility_tier() itself reads auth.jwt()/
-- auth.uid(), which are session-scoped, not view-owner-scoped.

create view public.vehicle_snapshots_public
with (security_invoker = false)
as
select
  v.id,
  v.tenant_id,
  v.make,
  v.model,
  v.year,
  v.ally_price,
  v.status,
  v.views_count,
  -- min_price: owner-only in every tier (design.md: "min_price is owner-only in every tier").
  case when app.visibility_tier(v.tenant_id) = 'owner' then v.min_price end as min_price,
  -- name + contact: masked below the `connected` tier — a `candidate`-tier
  -- viewer sees the vehicle but not who owns it (network-connections:
  -- Candidate Visibility Tier masks name AND contact).
  case when app.visibility_tier(v.tenant_id) in ('owner', 'connected') then t.name end as tenant_name,
  case when app.visibility_tier(v.tenant_id) in ('owner', 'connected') then c.contact_phone end as contact_phone,
  -- Non-sensitive: lets the client mirror app.visibility_tier() for UX
  -- (network-authorization client guard) without a second round trip.
  app.visibility_tier(v.tenant_id) as visibility_tier
from public.vehicle_snapshots v
  join public.tenants t on t.id = v.tenant_id
  left join public.tenant_contacts c on c.tenant_id = v.tenant_id
where app.visibility_tier(v.tenant_id) <> 'none';

comment on view public.vehicle_snapshots_public is
  'The single read path for vehicle inventory. Row-filters and column-masks (min_price, tenant_name, contact_phone) off app.visibility_tier() in one enforcement point. Resource-specific eligibility (e.g. status = ''available'') is intentionally left to feature-level queries, not baked in here — design.md: layer 4 stays inline per table/query.';

-- =============================================================================
-- Grants/revokes: force all vehicle reads through the view.
-- =============================================================================
revoke select on public.vehicle_snapshots from authenticated;
revoke select on public.tenants from authenticated;
revoke select on public.tenant_contacts from authenticated;

grant select on public.vehicle_snapshots_public to authenticated;

-- The view itself has no RLS to enable (views don't carry their own RLS;
-- security_invoker = false means the view's WHERE/CASE expressions ARE the
-- enforcement, per-caller, via app.visibility_tier()). anon still has nothing:
-- the schema-wide `revoke all ... from anon` in 0003 covers this view's
-- underlying tables, and no explicit grant to anon is made here.
