# Proposal: Red Aliados Core MVP

## Intent

Avaluauto dealer tenants hold inventory that another tenant's client is actively looking for, but there is no channel to cross-sell it. Today that exchange happens ad hoc over personal WhatsApp: no consent record, no traceability, no accountability when someone ignores a peer. Red Aliados is a closed B2B network where a tenant sees a peer's inventory **only after a mutual, double opt-in connection**. It ships as a standalone repo/deploy/DB to de-risk V2, with intent to fold it in as a V2 module once the MVP proves out.

## Scope

### In Scope
- **Identity bridge**: trust V2-issued JWT via Supabase Third-Party Auth (JWKS); `tenant_id`, `red_aliados_enabled`, role claims. Zero local user table.
- **Read-only sync**: V2 outbox → `ingest-vehicle-event` Edge Function + `reconcile-outbox` (pg_cron), idempotent via `sync_event_log`. Mirrors tenants, responsible-person contacts, and vehicles.
- **Connections lifecycle**: `connection_request` from three origins (vehicle interest, Conseguir match response, suggested-candidate connect); 48h expiry; accept writes reciprocal `connection_edges` (directed model, asymmetric edges possible later).
- **Reputation**: response events (accepted / rejected / ignored-expired) + response time → computed score; ignoring penalizes more than an explicit reject.
- **Hybrid messaging**: lightweight thread scoped to the request origin (Supabase Realtime on a `messages` table); on acceptance, counterpart phone/WhatsApp is revealed for off-platform negotiation.
- **Conseguir**: register a sourcing request, search own V2 inventory first, then opt in to fan out **to already-connected tenants only**. A match does not auto-share the vehicle; proceeding fires an event that creates an Opportunity in V2's CRM.
- **Four-layer authorization** enforced in RLS: module enabled → active mutual connection → user granted network access by tenant admin → resource visible.
- Monorepo scaffold per the decided stack.

### Out of Scope
- Any self-registration, local credentials, or password flow.
- Any write path to vehicle data from Red Aliados (V2 is sole writer).
- Open catalog or public request wall (explicitly reversed from the HTML prototype).
- CRM pipeline management — V2 owns it; Red Aliados only emits the triggering event.
- Full chat infrastructure, WhatsApp Business API, anonymized phone proxy.
- V2-side work: Custom Access Token Hook, outbox emitters, `ally_price`/`min_price` fields, JWT signing migration.
- Delivery slicing into chained PRs — decided at `sdd-tasks` from the risk forecast.

## Capabilities

### New Capabilities
- `identity-bridge`: federated JWT trust, claim contract, session bootstrap, no local users.
- `network-authorization`: the four permission layers as RLS policies + client guards.
- `vehicle-sync`: outbox ingestion, reconciliation, idempotency, read-only mirror.
- `tenant-directory`: mirrored tenant + responsible-contact records, contact reveal rules.
- `network-connections`: request origins, 48h expiry, double opt-in, reciprocal edges.
- `partner-reputation`: response events, response time, computed score.
- `connection-messaging`: origin-scoped threads over Realtime, contact reveal on accept.
- `targeted-search`: Conseguir registration, own-inventory-first search, opt-in network fan-out, V2 Opportunity event.

### Modified Capabilities
- None (no existing specs in `openspec/specs/`).

## Approach

| Layer | Decision |
|---|---|
| Auth | Third-Party Auth + JWKS; claims are the only identity source; no shadow user table to drift. |
| Data | Strict read-model. Outbox + reconciliation gives eventual consistency without coupling V2 to our uptime. |
| Visibility | Closed-by-default at the database. RLS is the enforcement point; UI guards are convenience only. |
| Consent | Double opt-in, never unilateral Avaluauto curation. Avaluauto suggests candidates; tenants decide. |
| Contact | Hybrid: thread for traceability, real contact revealed on accept for real negotiation. No chat platform to maintain. |
| Domain | `features/*/{domain,data,hooks,components}`; `domain/` stays Supabase-free so the module can be lifted into V2 later. |

## Affected Areas

| Area | Impact | Description |
|---|---|---|
| `supabase/migrations/` | New | Full schema + RLS for all eight capabilities |
| `supabase/functions/ingest-vehicle-event` | New | Webhook receiver from V2 outbox |
| `supabase/functions/reconcile-outbox` | New | pg_cron reconciliation |
| `apps/web/src/features/*` | New | Feature slices per capability |
| `packages/contracts` | New | Generated DB types + Zod schemas, incl. the V2 webhook payload contract |
| **Avaluauto V2 (external repo)** | Modified | Access token hook, outbox emitters, price fields, Opportunity intake, possible JWT signing migration |

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| V2 still signs JWTs with legacy HS256 — Third-Party Auth needs asymmetric (RS256/ES256) | Med | **Verify before design.** If true, V2 key migration is a hard prerequisite; no fallback auth model is in scope. |
| `ally_price` / `min_price` absent on V2's vehicle record | Med | Out of our control. Blocks the pricing surface only — sync/connections can ship with the fields nullable. |
| Sync divergence (missed or out-of-order webhooks) | Med | `sync_event_log` idempotency + scheduled reconciliation as the correctness backstop; never trust the webhook alone. |
| RLS gap leaks inventory across unconnected tenants | Low/High-impact | Deny-by-default policies + Playwright e2e on the negative case (unconnected tenant sees nothing). |
| Module name collision — "Aliados" already exists in V2 | High | Naming is unresolved; keep the name in one config/i18n layer so a rename is not a refactor. |
| Empty-network cold start (no connections = empty product) | High | Avaluauto-suggested candidates flow is the seeding mechanism; its mechanics are still undefined. |
| Overbuilding messaging into a chat product | Med | Hard cap: one table, Realtime, no attachments, no presence, no read receipts. |

## Rollback Plan

- **Edge Functions**: independently versioned/redeployable; disabling `ingest-vehicle-event` stops ingestion without affecting reads (mirror goes stale, does not break). Reconciliation replays the gap on re-enable.
- **RLS**: every policy change ships as a reversible migration; the down path restores the previous deny-by-default policy set. Never drop a policy without its replacement in the same migration.
- **V2 side**: the outbox emitter is feature-flagged in V2 — flipping it off severs the integration with zero V2 user impact.
- **Whole module**: `red_aliados_enabled: false` in the V2 access-token hook removes all access instantly, no deploy required.

## Dependencies

**Blocking prerequisites (Avaluauto V2 repo — outside this change's control):**
1. V2 Supabase project must sign JWTs asymmetrically (RS256/ES256). Legacy HS256 → migration required first.
2. V2 Custom Access Token Hook emitting `tenant_id`, `red_aliados_enabled`, role.
3. V2 outbox emitting vehicle/tenant events to our webhook.
4. `ally_price` / `min_price` on V2's vehicle record — confirm existence or add there first.
5. V2 CRM Opportunity intake endpoint for Conseguir conversions.

**Open business questions (must be answered before or during design; do not silently assume):**
- Final module name — "Aliados" collides with an unrelated existing V2 module whose purpose is still unexplained.
- Mechanics of Avaluauto's "suggest candidates" flow: admin screen, manual Supabase Studio process for the pilot, or automated matching.
- Notification channel for Conseguir matches: in-app only, or also email/push.

## Success Criteria

- [ ] A user with `red_aliados_enabled: true` signs in with a V2 JWT and never sees a Red Aliados registration form.
- [ ] An unconnected tenant sees zero inventory, zero requests, zero contact data — verified by e2e against RLS, not UI.
- [ ] A vehicle created in V2 appears in Red Aliados via webhook, and reconciliation repairs a deliberately dropped event.
- [ ] Connection request accepted → reciprocal edges exist → inventory visible → counterpart contact revealed.
- [ ] A request left untouched for 48h expires and penalizes reputation more than an explicit rejection.
- [ ] A Conseguir search hits own inventory first, fans out only to connected tenants on explicit opt-in, and creates a V2 Opportunity when the requester proceeds.
- [ ] No table in the Red Aliados database stores credentials or a locally-created vehicle.
