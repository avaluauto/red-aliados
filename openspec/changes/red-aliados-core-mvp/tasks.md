# Tasks: Red Aliados Core MVP

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 3500-5000+ (scaffold, 4 migrations, 2 edge fns, 8 feature slices x domain/data/hooks/components/tests) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR0 scaffold -> PR1 DB/RLS -> PR2 identity-bridge -> PR3 network-authorization -> PR4 vehicle-sync -> PR5 tenant-directory -> PR6 network-connections -> PR7 partner-reputation -> PR8 connection-messaging -> PR9 targeted-search -> PR10 e2e/docs |
| Delivery strategy | ask-on-risk |
| Chain strategy | stacked-to-main (confirmed by user before PR0 apply) |

Decision needed before apply: No — resolved as stacked-to-main
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | PR | Base |
|------|------|----|----|
| 0 | Monorepo scaffold | PR0 | main |
| 1 | DB schema, app helpers, RLS, public views | PR1 | PR0 |
| 2 | identity-bridge | PR2 | PR1 |
| 3 | network-authorization client guards | PR3 | PR1 |
| 4 | vehicle-sync edge functions | PR4 | PR1 |
| 5 | tenant-directory | PR5 | PR2, PR4 |
| 6 | network-connections | PR6 | PR5 |
| 7 | partner-reputation | PR7 | PR6 |
| 8 | connection-messaging | PR8 | PR6 |
| 9 | targeted-search | PR9 | PR6 |
| 10 | Cross-capability e2e + docs | PR10 | PR9 |

## Phase 0: Monorepo Scaffold

- [x] 0.1 pnpm workspace: root `package.json`, `pnpm-workspace.yaml` (apps/web, packages/contracts)
- [x] 0.2 Scaffold `apps/web`, `packages/contracts`, `supabase/` (config.toml, migrations/, functions/)
- [x] 0.3 Wire Vitest, Playwright, pgTAP test scripts per package

## Phase 1: DB Foundation (blocks all features)

- [x] 1.1 pgTAP + `supabase/migrations/0001_core_schema.sql`: 13 tables + indexes incl. `connection_edges(viewer_tenant_id, visible_tenant_id) where revoked_at is null`
- [x] 1.2 pgTAP + `0002_app_helpers.sql`: `app.module_enabled/current_tenant_id/is_connected/has_network_access/visibility_tier`
- [x] 1.3 pgTAP masking matrix (owner/connected/candidate/none) + `0003_rls_policies.sql`: deny-by-default + `insert_own_request` CHECK
- [x] 1.4 pgTAP + `0004_public_views.sql`: `vehicle_snapshots_public` SECURITY DEFINER view + grants/revokes
- [x] 1.5 Generate `packages/contracts/src/db` types from schema (hand-written — see apply-progress deviation)

## Phase 2: identity-bridge

- [x] 2.1 Configure Supabase Third-Party Auth (JWKS) against V2 project (documented, not executed -- see `supabase/THIRD_PARTY_AUTH.md`, no live project exists)
- [x] 2.2 Vitest + `features/identity-bridge/domain`: claim contract validation
- [x] 2.3 `.../data,hooks`: session bootstrap from JWT, no local user writes
- [x] 2.4 `.../components`: module-disabled state (no registration form)
- [x] 2.5 Playwright: valid JWT signs in silently; disabled tenant sees gate, zero queries

## Phase 3: network-authorization

- [x] 3.1 Vitest + `features/network-authorization/domain`: tier resolution mirroring `app.visibility_tier()`
- [x] 3.2 `.../hooks`: client guard wrapping queries (UX only, not the security boundary)
- [x] 3.3 Playwright: unconnected tenant client-side proof done; direct table query RLS proof documented as a verification gap (no live Supabase project -- see apply-progress)

## Phase 4: vehicle-sync

- [x] 4.1 `packages/contracts/src/zod`: webhook payload schema (`vehicleSyncEventSchema`, see PR4 deviation: descriptive-only V2 fields not persisted)
- [x] 4.2 Vitest + `supabase/functions/ingest-vehicle-event/index.ts`: HMAC verify, `sync_event_log` dedupe, seq-gated upsert (real logic in `packages/vehicle-sync`; Deno entrypoint is a thin, unexecuted wrapper — see apply-progress)
- [x] 4.3 Vitest + `supabase/functions/reconcile-outbox/index.ts`: retry backoff (1m/5m/25m/2h/12h, dead after 6th total attempt — documented interpretation, see apply-progress) + gap scan
- [x] 4.4 pg_cron migration scheduling `reconcile-outbox` /15min (`0005_pg_cron_reconcile.sql`, pg_cron + pg_net pattern, NOT executed — no pg_cron/pg_net-enabled Postgres in sandbox)
- [x] 4.5 Integration: duplicate delivery no-op; out-of-order -> `skipped_stale`; dropped event repaired (packages/vehicle-sync/src/integration.test.ts, run for real)

## Phase 5: tenant-directory

- [x] 5.1 Vitest + `features/tenant-directory/domain`: contact-reveal + reputation-visible rules
- [x] 5.2 `.../data,hooks`: query via `vehicle_snapshots_public` + contact join
- [x] 5.3 `.../components`: candidate card (reputation shown, phone masked)
- [x] 5.4 Playwright: pre-connection masking; zero rows without linking request

## Phase 6: network-connections

- [x] 6.1 Vitest + `features/network-connections/domain`: `suggested->pending->accepted|rejected|expired` state machine + 48h expiry calc
- [x] 6.2 `.../data,hooks`: create request (vehicle_interest/search_match), accept/reject mutations
- [x] 6.3 pg_cron migration: auto-expire pending requests past 48h (`0006_pg_cron_expire_requests.sql`, groups the state-transition/reciprocal-edge trigger + the expiry sweep -- see apply-progress deviation)
- [x] 6.4 `.../components`: request/accept/reject UI
- [x] 6.5 Playwright: accept -> reciprocal edges; reject/expiry -> none; seeded `direct` only via service role (direct-insert RLS proof documented as verification gap, same as PR3 -- see apply-progress)

## Phase 7: partner-reputation

- [x] 7.1 Vitest + `features/partner-reputation/domain`: score computation, expiry-penalizes-more-than-rejection
- [x] 7.2 DB trigger: emit `reputation_events` on terminal state (skip `suggested`)
- [x] 7.3 Playwright: expired vs rejected scores diverge as specified

## Phase 8: connection-messaging

- [ ] 8.1 Vitest + `features/connection-messaging/domain`: contact-reveal-on-accept gate
- [ ] 8.2 `.../data,hooks`: Realtime subscription on `messages`, scoped to request origin
- [ ] 8.3 `.../components`: thread UI, no attachments/presence/read-receipts
- [ ] 8.4 Playwright: 3rd tenant cannot read thread; contact hidden pending -> shown on accept

## Phase 9: targeted-search

- [ ] 9.1 Vitest + `features/targeted-search/domain`: own-inventory-first order, opt-in gate, connected-only fan-out filter
- [ ] 9.2 `.../data,hooks`: own-inventory search, opt-in fan-out query, proceed -> Opportunity event
- [ ] 9.3 `.../components`: search + match + proceed UI
- [ ] 9.4 Playwright: unconnected tenant excluded; view-only shares nothing; proceed fires V2 Opportunity

## Phase 10: Cross-Capability Verification

- [ ] 10.1 Playwright: full success-criteria flow (signin -> sync -> connect -> reveal -> message -> reputation -> search)
- [ ] 10.2 Update docs; log open questions (module name, V2 JWT alg, webhook auth shape) as follow-ups
