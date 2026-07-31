# Design: Red Aliados Core MVP

## Technical Approach

Enforcement lives in Postgres, not the client. Every visibility rule is a SQL predicate composed from four helper functions in an `app` schema; the React layer only mirrors them for UX. Base tables are revoked from `authenticated`; reads go through `vehicle_snapshots_public`, a SECURITY DEFINER view that both filters rows and masks columns. Sync is webhook-first with a reconciliation backstop, idempotent on V2's outbox event id.

## Architecture Decisions

### Decision: column-level masking via SECURITY DEFINER view

| Option | Tradeoff | Verdict |
|---|---|---|
| App-layer projection in `features/*/data` | Bypassable — anon key + direct PostgREST call returns `min_price` | Rejected |
| `GRANT SELECT (cols)` column privileges | Static per role; owner must see own `min_price`, peer must not | Rejected |
| View with `security_invoker = false` + `CASE` per column | One enforcement point, per-caller, pgTAP-testable | **Chosen** |

RLS is row-level only, so masking is expressed as projection. The view owner reads the base table; the view's own predicates are the gate.

```sql
-- app.visibility_tier(target) -> 'owner' | 'connected' | 'candidate' | 'none'
create view vehicle_snapshots_public with (security_invoker = false) as
select v.id, v.tenant_id, v.make, v.model, v.year, v.ally_price, v.status, v.views_count,
  case when app.visibility_tier(v.tenant_id) = 'owner' then v.min_price end as min_price,
  case when app.visibility_tier(v.tenant_id) in ('owner','connected') then t.name end as tenant_name,
  case when app.visibility_tier(v.tenant_id) in ('owner','connected') then a.contact_phone end as contact_phone
from vehicle_snapshots v
  join tenants t on t.id = v.tenant_id
  left join tenant_users_access a on a.tenant_id = v.tenant_id
where app.visibility_tier(v.tenant_id) <> 'none';
```

**Pre-connection masking**: `candidate` tier exists so `origin_type = vehicle_interest` is reachable without a prior edge. A tenant sees a peer's vehicles unnamed and contactless while a `connection_requests` row with `status = 'suggested'` links them. `min_price` is owner-only in every tier.

### Decision: `sync_event_log` idempotency

| Aspect | Design |
|---|---|
| Dedupe key | `unique (source, event_id)` — V2 outbox row id, not a payload hash (identical payloads are distinct events) |
| Ingest | `insert ... on conflict do nothing`; zero rows affected → already processed → `200 OK`, no side effect |
| Ordering | `source_seq bigint` per aggregate; apply only if `source_seq > target.last_source_seq`, else `skipped_stale` |
| Status | `received → applied \| failed \| skipped_stale \| dead` |
| Retry | `attempts`, `next_attempt_at`; backoff 1m/5m/25m/2h/12h, max 5 → `dead` + alert |
| Reconcile | pg_cron /15min: (1) drain `status in ('received','failed') and next_attempt_at <= now()`; (2) gap scan V2 `/outbox?since=<max applied seq>` |

### Decision: pilot seeding via service role, no admin UI

New status `suggested` (distinct from `pending`). Avaluauto inserts via Studio/service_role, which bypasses RLS — so **no** INSERT policy is written for it. The user-facing policy is deliberately narrow:

```sql
create policy insert_own_request on connection_requests for insert to authenticated
with check (
  app.module_enabled() and app.has_network_access()
  and requester_tenant_id = app.current_tenant_id()
  and origin_type in ('vehicle_interest','search_match')
);
-- CHECK constraint: origin_type = 'direct' requires seeded_by is not null
```

Suggested rows carry `expires_at = null` and emit no `reputation_events` — the tenant never chose to send them. Acting on a suggestion transitions it to `pending` with `expires_at = now() + interval '48 hours'`, at which point the 48h/reputation rules apply.

### Decision: four permission layers as composable SQL

| Layer | Function | Source |
|---|---|---|
| 1. Module enabled | `app.module_enabled()` | `(auth.jwt()->>'red_aliados_enabled')::bool` |
| 2. Active edge | `app.is_connected(t)` | `connection_edges` viewer→visible, `revoked_at is null` |
| 3. User network access | `app.has_network_access()` | `tenant_users_access` on `auth.uid()` + `app.current_tenant_id()`, `granted = true` |
| 4. Resource-specific | inline predicate | vehicle `status='available'`; message requires being a party to the request |

`app.visibility_tier()` is `stable security definer` and composes 1→3; layer 4 stays inline so each table keeps its own rule. Layer 1 is the first conjunct everywhere (cheapest fail). Index: `connection_edges (viewer_tenant_id, visible_tenant_id) where revoked_at is null`.

## Data Flow — sync

```
V2 outbox ──POST──> ingest-vehicle-event ──> sync_event_log (on conflict do nothing)
                            │                        │ inserted?
                            │                  no ───┴──> 200 (dup)
                            └── yes ──> seq > last? ──no──> skipped_stale
                                            │ yes
                                            └──> upsert vehicle_snapshots ──> applied

pg_cron /15m ──> reconcile-outbox ──> retry due rows ──> gap scan V2 since max(seq)
```

## File Changes

| Path | Action | Description |
|---|---|---|
| `supabase/migrations/0001_core_schema.sql` | Create | 13 tables + indexes |
| `supabase/migrations/0002_app_helpers.sql` | Create | `app.*` claim/tier functions |
| `supabase/migrations/0003_rls_policies.sql` | Create | Deny-by-default + per-table policies |
| `supabase/migrations/0004_public_views.sql` | Create | `vehicle_snapshots_public`, grants/revokes |
| `supabase/functions/ingest-vehicle-event/index.ts` | Create | Webhook receiver, HMAC-verified |
| `supabase/functions/reconcile-outbox/index.ts` | Create | Retry drain + gap scan |
| `packages/contracts/src/{db,zod}` | Create | Generated types + webhook/entity schemas |
| `apps/web/src/features/{identity-bridge,vehicle-sync,tenant-directory,network-connections,partner-reputation,connection-messaging,targeted-search}` | Create | `domain/` (pure) · `data/` (Supabase) · `hooks/` (Query) · `components/` |

## Testing Strategy (Strict TDD)

| Layer | What | How |
|---|---|---|
| Unit (pure) | `domain/`: expiry, reputation scoring, tier rules, state machine | Vitest, zero Supabase imports — write first |
| DB | Masking matrix (owner/connected/candidate/none × `min_price`/contact), idempotency, stale-seq | pgTAP via `supabase test db`, JWT claim fixtures |
| Integration | Edge Functions: duplicate, out-of-order, retry, gap scan | Vitest + local Supabase |
| Component | Containers/presentational | Vitest + RTL |
| E2E | Accept → inventory visible → contact revealed; **negative**: unconnected sees zero | Playwright |

## Open Questions

- [ ] Module name collision with V2 "Aliados" — isolate in one i18n/config key.
- [ ] V2 JWT signing algorithm (HS256 legacy blocks Third-Party Auth).
- [ ] Webhook auth shape: HMAC shared secret vs. service-role bearer.
