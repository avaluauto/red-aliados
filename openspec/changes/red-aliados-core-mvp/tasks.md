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

- [ ] 2.1 Configure Supabase Third-Party Auth (JWKS) against V2 project
- [ ] 2.2 Vitest + `features/identity-bridge/domain`: claim contract validation
- [ ] 2.3 `.../data,hooks`: session bootstrap from JWT, no local user writes
- [ ] 2.4 `.../components`: module-disabled state (no registration form)
- [ ] 2.5 Playwright: valid JWT signs in silently; disabled tenant sees gate, zero queries

## Phase 3: network-authorization

- [ ] 3.1 Vitest + `features/network-authorization/domain`: tier resolution mirroring `app.visibility_tier()`
- [ ] 3.2 `.../hooks`: client guard wrapping queries (UX only, not the security boundary)
- [ ] 3.3 Playwright: unconnected tenant + direct table query both return zero rows

## Phase 4: vehicle-sync

- [ ] 4.1 `packages/contracts/src/zod`: webhook payload schema
- [ ] 4.2 Vitest + `supabase/functions/ingest-vehicle-event/index.ts`: HMAC verify, `sync_event_log` dedupe, seq-gated upsert
- [ ] 4.3 Vitest + `supabase/functions/reconcile-outbox/index.ts`: retry backoff (1m/5m/25m/2h/12h, dead@5) + gap scan
- [ ] 4.4 pg_cron migration scheduling `reconcile-outbox` /15min
- [ ] 4.5 Integration: duplicate delivery no-op; out-of-order -> `skipped_stale`; dropped event repaired

## Phase 5: tenant-directory

- [ ] 5.1 Vitest + `features/tenant-directory/domain`: contact-reveal + reputation-visible rules
- [ ] 5.2 `.../data,hooks`: query via `vehicle_snapshots_public` + contact join
- [ ] 5.3 `.../components`: candidate card (reputation shown, phone masked)
- [ ] 5.4 Playwright: pre-connection masking; zero rows without linking request

## Phase 6: network-connections

- [ ] 6.1 Vitest + `features/network-connections/domain`: `suggested->pending->accepted|rejected|expired` state machine + 48h expiry calc
- [ ] 6.2 `.../data,hooks`: create request (vehicle_interest/search_match), accept/reject mutations
- [ ] 6.3 pg_cron migration: auto-expire pending requests past 48h
- [ ] 6.4 `.../components`: request/accept/reject UI
- [ ] 6.5 Playwright: accept -> reciprocal edges; reject/expiry -> none; seeded `direct` only via service role

## Phase 7: partner-reputation

- [ ] 7.1 Vitest + `features/partner-reputation/domain`: score computation, expiry-penalizes-more-than-rejection
- [ ] 7.2 DB trigger: emit `reputation_events` on terminal state (skip `suggested`)
- [ ] 7.3 Playwright: expired vs rejected scores diverge as specified

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
