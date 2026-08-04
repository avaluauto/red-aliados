-- 0012_vehicle_snapshots_public_member_since.sql
-- Adds tenant_member_since to vehicle_snapshots_public -- the vehicle detail
-- page's UI reference wanted a "member since" line for the owning tenant.
-- tenants.created_at has existed since 0001_core_schema.sql; it was simply
-- never selected through the one sanctioned read path (0004_public_views.sql)
-- until now. Masked identically to tenant_name/contact_phone (owner/connected
-- tier only) -- a candidate-tier viewer shouldn't learn anything about WHO
-- owns a vehicle, including how long they've been a member, before a real
-- connection exists.

create or replace view public.vehicle_snapshots_public
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
  case when app.visibility_tier(v.tenant_id) = 'owner' then v.min_price end as min_price,
  case when app.visibility_tier(v.tenant_id) in ('owner', 'connected') then t.name end as tenant_name,
  case when app.visibility_tier(v.tenant_id) in ('owner', 'connected') then c.contact_phone end as contact_phone,
  app.visibility_tier(v.tenant_id) as visibility_tier,
  -- Appended at the end -- CREATE OR REPLACE VIEW cannot insert a column
  -- before existing ones, only append (confirmed against the real error
  -- Postgres raises otherwise: "cannot change name of view column").
  case when app.visibility_tier(v.tenant_id) in ('owner', 'connected') then t.created_at end as tenant_member_since
from public.vehicle_snapshots v
  join public.tenants t on t.id = v.tenant_id
  left join public.tenant_contacts c on c.tenant_id = v.tenant_id
where app.visibility_tier(v.tenant_id) <> 'none';

comment on view public.vehicle_snapshots_public is
  'The single read path for vehicle inventory. Row-filters and column-masks (min_price, tenant_name, contact_phone, tenant_member_since) off app.visibility_tier() in one enforcement point. Resource-specific eligibility (e.g. status = ''available'') is intentionally left to feature-level queries, not baked in here — design.md: layer 4 stays inline per table/query.';
