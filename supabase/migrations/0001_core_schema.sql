-- 0001_core_schema.sql
-- Phase 1 (PR1): DB Foundation — core tables for all 8 Red Aliados capabilities.
-- Red Aliados has zero local user table (see identity-bridge spec): `user_id`
-- columns below store `auth.uid()` from V2-issued, federated JWTs. They are
-- intentionally NOT foreign keys — there is no local `users` table to key
-- against, by design.
--
-- Table order is dependency order (each FK target is created before its
-- referencing table) to avoid forward references / deferred constraints.

create schema if not exists app;

comment on schema app is
  'Red Aliados authorization + sync helper functions (see 0002_app_helpers.sql). Not exposed as a queryable data schema by itself.';

-- Shared `updated_at` trigger, reused by every table below that has the column.
create or replace function app.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

comment on function app.set_updated_at() is
  'BEFORE UPDATE trigger: stamps updated_at = now() on every row update.';

-- =============================================================================
-- 1. tenants — mirrored V2 dealer tenant identity (read-only mirror, see vehicle-sync spec)
-- =============================================================================
create table public.tenants (
  id uuid primary key, -- V2 tenant id; not locally generated
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.tenants is
  'Read-only mirror of V2 dealer tenants. V2 is the sole writer via sync (see vehicle-sync spec).';

create trigger set_updated_at
  before update on public.tenants
  for each row execute function app.set_updated_at();

-- =============================================================================
-- 2. tenant_contacts — exactly one responsible contact per tenant (tenant-directory spec)
-- =============================================================================
create table public.tenant_contacts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null unique references public.tenants (id) on delete cascade,
  contact_name text not null,
  contact_phone text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.tenant_contacts is
  'Exactly one responsible contact (name, phone/WhatsApp) per tenant, synced from V2. UNIQUE(tenant_id) enforces the "exactly one" rule (tenant-directory: One Contact Per Tenant).';

create trigger set_updated_at
  before update on public.tenant_contacts
  for each row execute function app.set_updated_at();

-- =============================================================================
-- 3. tenant_users_access — per-user network access grant within a tenant (layer 3)
-- =============================================================================
create table public.tenant_users_access (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  user_id uuid not null, -- auth.uid() of a V2-federated user; no local users table to FK
  granted boolean not null default false,
  granted_by uuid,
  granted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, user_id)
);

comment on table public.tenant_users_access is
  'Layer 3 authorization: does this user, within this tenant, have network access granted by a tenant admin? See network-authorization: Four-Layer Authorization.';

create index tenant_users_access_user_id_idx on public.tenant_users_access (user_id);

create trigger set_updated_at
  before update on public.tenant_users_access
  for each row execute function app.set_updated_at();

-- =============================================================================
-- 4. vehicle_snapshots — read-only mirror of V2 vehicle inventory (vehicle-sync spec)
-- =============================================================================
create table public.vehicle_snapshots (
  id uuid primary key, -- V2 vehicle id; not locally generated
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  make text not null,
  model text not null,
  year integer,
  ally_price numeric(12, 2),
  min_price numeric(12, 2), -- owner-only column; masked in vehicle_snapshots_public (0004)
  status text not null default 'available',
  views_count integer not null default 0,
  last_source_seq bigint not null default 0, -- idempotent ordered-apply watermark, see sync_event_log
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.vehicle_snapshots is
  'Read-only mirror of V2 vehicle inventory. V2 is the sole writer (vehicle-sync: Read-Only Mirror). last_source_seq guards against applying stale/out-of-order sync events.';

create index vehicle_snapshots_tenant_id_idx on public.vehicle_snapshots (tenant_id);

create trigger set_updated_at
  before update on public.vehicle_snapshots
  for each row execute function app.set_updated_at();

-- =============================================================================
-- 5. vehicle_snapshot_photos — mirrored photos for a vehicle snapshot
-- =============================================================================
create table public.vehicle_snapshot_photos (
  id uuid primary key default gen_random_uuid(),
  vehicle_snapshot_id uuid not null references public.vehicle_snapshots (id) on delete cascade,
  url text not null,
  position integer not null default 0,
  created_at timestamptz not null default now()
);

create index vehicle_snapshot_photos_vehicle_snapshot_id_idx
  on public.vehicle_snapshot_photos (vehicle_snapshot_id);

-- =============================================================================
-- 6. search_requests — Conseguir sourcing request registration (targeted-search spec)
-- =============================================================================
create table public.search_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  requested_by uuid not null, -- auth.uid() of the requesting user
  criteria jsonb not null default '{}'::jsonb,
  status text not null default 'open' check (status in ('open', 'fulfilled', 'closed')),
  opted_in_fan_out boolean not null default false,
  opted_in_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.search_requests is
  'Conseguir sourcing request. own-inventory search runs first; opted_in_fan_out gates network fan-out to connected tenants only (targeted-search spec).';

create index search_requests_tenant_id_idx on public.search_requests (tenant_id);

create trigger set_updated_at
  before update on public.search_requests
  for each row execute function app.set_updated_at();

-- =============================================================================
-- 7. search_request_targets — connected tenants included in an opted-in fan-out
-- =============================================================================
create table public.search_request_targets (
  id uuid primary key default gen_random_uuid(),
  search_request_id uuid not null references public.search_requests (id) on delete cascade,
  target_tenant_id uuid not null references public.tenants (id),
  included_at timestamptz not null default now(),
  unique (search_request_id, target_tenant_id)
);

create index search_request_targets_target_tenant_id_idx
  on public.search_request_targets (target_tenant_id);

-- =============================================================================
-- 8. connection_requests — double opt-in connection lifecycle (network-connections spec)
-- =============================================================================
create table public.connection_requests (
  id uuid primary key default gen_random_uuid(),
  requester_tenant_id uuid not null references public.tenants (id),
  recipient_tenant_id uuid not null references public.tenants (id),
  origin_type text not null check (origin_type in ('vehicle_interest', 'search_match', 'direct')),
  status text not null default 'pending'
    check (status in ('suggested', 'pending', 'accepted', 'rejected', 'expired')),
  vehicle_snapshot_id uuid references public.vehicle_snapshots (id),
  search_request_id uuid references public.search_requests (id),
  seeded_by text, -- operator identifier; required (and only meaningful) when origin_type = 'direct'
  requested_by uuid, -- auth.uid() of the requesting user; null for seeded/direct requests
  responded_by uuid, -- auth.uid() of the user who accepted/rejected
  expires_at timestamptz,
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint connection_requests_no_self_link check (requester_tenant_id <> recipient_tenant_id),
  -- Manual Cold-Start Seeding: origin_type = 'direct' REQUIRES seeded_by (operator
  -- provenance); every other origin MUST NOT set it. This is the structural half of
  -- "no INSERT policy exists for direct" (see 0003_rls_policies.sql) — even a
  -- service-role bulk insert cannot produce a direct row without seeded_by.
  constraint connection_requests_direct_requires_seeded_by
    check ((origin_type = 'direct') = (seeded_by is not null))
);

comment on table public.connection_requests is
  'Double opt-in connection lifecycle: suggested -> pending -> accepted|rejected|expired. See network-connections spec.';

create index connection_requests_requester_tenant_id_idx
  on public.connection_requests (requester_tenant_id);
create index connection_requests_recipient_tenant_id_idx
  on public.connection_requests (recipient_tenant_id);
create index connection_requests_status_idx on public.connection_requests (status);
-- Supports the pg_cron auto-expire scan (Phase 6.3): pending rows past their expiry.
create index connection_requests_pending_expiry_idx
  on public.connection_requests (expires_at)
  where status = 'pending';

create trigger set_updated_at
  before update on public.connection_requests
  for each row execute function app.set_updated_at();

-- =============================================================================
-- 9. connection_edges — reciprocal, directed visibility edges created on acceptance
-- =============================================================================
create table public.connection_edges (
  id uuid primary key default gen_random_uuid(),
  viewer_tenant_id uuid not null references public.tenants (id),
  visible_tenant_id uuid not null references public.tenants (id),
  connection_request_id uuid not null references public.connection_requests (id),
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  constraint connection_edges_no_self_edge check (viewer_tenant_id <> visible_tenant_id)
);

comment on table public.connection_edges is
  'Directed, per-viewer visibility edge. Acceptance writes TWO rows (A->B and B->A) — see network-connections: 48-Hour Expiry with Double Opt-In.';

-- Design-mandated index: the primary lookup path for app.is_connected(), and also
-- enforces "at most one active edge per (viewer, visible) pair" via uniqueness.
create unique index connection_edges_viewer_visible_active_idx
  on public.connection_edges (viewer_tenant_id, visible_tenant_id)
  where revoked_at is null;

-- =============================================================================
-- 10. connection_messages — origin-scoped thread (connection-messaging spec)
-- =============================================================================
create table public.connection_messages (
  id uuid primary key default gen_random_uuid(),
  connection_request_id uuid not null references public.connection_requests (id) on delete cascade,
  sender_tenant_id uuid not null references public.tenants (id),
  sender_user_id uuid not null, -- auth.uid()
  body text not null check (char_length(body) > 0),
  created_at timestamptz not null default now()
);

comment on table public.connection_messages is
  'One thread per connection_request origin. No attachments/presence/read-receipts (connection-messaging: Scope Cap).';

create index connection_messages_connection_request_id_idx
  on public.connection_messages (connection_request_id);

-- =============================================================================
-- 11. reputation_events — response events feeding the computed score (partner-reputation spec)
-- =============================================================================
create table public.reputation_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id), -- the tenant being scored (the recipient)
  connection_request_id uuid not null unique references public.connection_requests (id),
  event_type text not null check (event_type in ('accepted', 'rejected', 'expired')),
  response_time_seconds bigint not null,
  created_at timestamptz not null default now()
);

comment on table public.reputation_events is
  'One row per terminal connection_request outcome (accepted/rejected/expired). UNIQUE(connection_request_id) — a request has exactly one terminal event. Never emitted for status=suggested (network-connections: Suggested Status for Seeded Requests).';

create index reputation_events_tenant_id_idx on public.reputation_events (tenant_id);

-- =============================================================================
-- 12. search_opportunities_out — explicit "proceed" firing a V2 Opportunity event
-- =============================================================================
create table public.search_opportunities_out (
  id uuid primary key default gen_random_uuid(),
  search_request_id uuid not null references public.search_requests (id) on delete cascade,
  vehicle_snapshot_id uuid not null references public.vehicle_snapshots (id),
  matched_tenant_id uuid not null references public.tenants (id),
  proceeded_by uuid not null, -- auth.uid()
  proceeded_at timestamptz not null default now(),
  v2_opportunity_ref text, -- external V2 CRM Opportunity id, if/when returned
  created_at timestamptz not null default now()
);

comment on table public.search_opportunities_out is
  'Records an explicit "proceed" action that fires an Opportunity-creation event to V2 CRM. Red Aliados does not track further pipeline stages (targeted-search: No Auto-Share; Explicit Proceed Fires Opportunity Event).';

create index search_opportunities_out_search_request_id_idx
  on public.search_opportunities_out (search_request_id);

-- =============================================================================
-- 13. sync_event_log — idempotent, ordered outbox ingestion ledger (vehicle-sync spec)
-- =============================================================================
create table public.sync_event_log (
  id uuid primary key default gen_random_uuid(),
  source text not null, -- e.g. 'v2-outbox'
  event_id text not null, -- V2 outbox row id (NOT a payload hash — identical payloads are distinct events)
  aggregate_type text not null check (aggregate_type in ('vehicle', 'tenant')),
  aggregate_id text not null,
  source_seq bigint not null,
  status text not null default 'received'
    check (status in ('received', 'applied', 'failed', 'skipped_stale', 'dead')),
  attempts integer not null default 0,
  next_attempt_at timestamptz,
  payload jsonb not null default '{}'::jsonb,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source, event_id)
);

comment on table public.sync_event_log is
  'Idempotency ledger for V2 outbox ingestion. UNIQUE(source, event_id) makes duplicate delivery a no-op. source_seq gates out-of-order application (see design: sync_event_log idempotency).';

create index sync_event_log_reconcile_scan_idx
  on public.sync_event_log (status, next_attempt_at)
  where status in ('received', 'failed');
create index sync_event_log_aggregate_idx
  on public.sync_event_log (aggregate_type, aggregate_id, source_seq);

create trigger set_updated_at
  before update on public.sync_event_log
  for each row execute function app.set_updated_at();
