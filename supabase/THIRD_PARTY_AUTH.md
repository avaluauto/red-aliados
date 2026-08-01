# Third-Party Auth (JWKS) — identity-bridge config (task 2.1)

## Status: NOT CONFIGURED

There is no live Supabase project for red-aliados yet. This document
describes exactly what needs to be configured, by whom, and in what order,
once one exists. Nothing here has been applied against a real project — do
not treat this file as evidence that Third-Party Auth is active. The
application code in `apps/web/src/features/identity-bridge` is written
against the shape this config produces (a verified JWT with `tenant_id`,
`role`, `red_aliados_enabled` claims, readable via
`supabase.auth.getClaims()`), but it currently runs against a placeholder
Supabase client (see `data/supabase-client.ts`) that fails closed until a
real project exists.

## What "Third-Party Auth" means here

Red Aliados trusts JWTs **issued by V2**, not by its own Supabase project's
GoTrue server (spec: identity-bridge — Federated JWT Trust). Supabase
supports this via "Third-Party Auth": you register an external JWT issuer
(V2) with red-aliados's Supabase project, pointing at that issuer's JWKS
endpoint (its published public keys for asymmetric signature verification —
RS256/ES256, not HS256). Once registered, `supabase.auth.getClaims()` and
Postgres's `auth.jwt()` both verify and expose V2-issued tokens as if they
were locally issued, with **zero** local user record ever created (matches
"Claim Contract": no local users table exists in this schema at all).

## Preconditions on the V2 side (owned by V2, not this repo)

1. V2's Supabase project (or whatever issues its session tokens) must sign
   JWTs with an **asymmetric** algorithm (RS256 or ES256). This repo's own
   design doc flags this as an open question — HS256 (symmetric) legacy
   tokens **cannot** be used with Third-Party Auth's local JWKS
   verification path and would fall back to a per-request network call to
   V2's Auth server for every claim read, which this integration does not
   assume or handle.
2. V2's JWKS must be reachable at a stable, public URL — for a Supabase
   project this is `https://<v2-project-ref>.supabase.co/auth/v1/.well-known/jwks.json`.
3. V2 must add three custom claims to the access token it issues for a
   Red Aliados-eligible user:
   - `tenant_id` (uuid, required) — the dealer tenant the user belongs to.
   - `red_aliados_enabled` (boolean) — whether the module is turned on for
     that tenant. Absent or `false` MUST both mean "disabled" client-side
     (identity-bridge's domain layer already fails closed on this).
   - `role` (string, required) — **KNOWN RISK, not resolved by this PR**:
     Supabase's own JWT contract reserves a top-level `role` claim for
     PostgREST role switching (it is always `"authenticated"` for a signed-in
     user — see `@supabase/auth-js`'s `RequiredClaims` type). If V2 emits its
     app-level dealer role under the same top-level `role` key, it collides
     with that reserved claim. This needs a decision with V2 before task 2.1
     is actually executed against a real project — e.g. emit the app-level
     role under a distinct claim key (`app_role`, or nested under
     `app_metadata.role`) instead of overloading `role`. See this PR's Risks
     section in the apply-progress report.
   These are exactly the claims `apps/web/src/features/identity-bridge/domain/session-claims.ts`
   validates and `supabase/migrations/0002_app_helpers.sql`'s
   `app.module_enabled()`/`app.current_tenant_id()` already read via
   `auth.jwt() ->> 'tenant_id'` / `auth.jwt() ->> 'red_aliados_enabled'`.

## Steps to run for real, once a red-aliados Supabase project exists

1. Create the red-aliados Supabase project (hosted, or `supabase start`
   locally with Docker).
2. In Supabase Studio for that project: **Authentication → Sign In / Auth
   Providers → Third Party Auth** (exact menu path per Supabase's current
   dashboard — verify against Supabase's own docs when this step is
   actually run, since dashboard layouts change) → add a new integration
   pointing at V2's issuer URL / JWKS endpoint.
3. Confirm `enable_signup = false` stays set in `supabase/config.toml`'s
   `[auth]` section (already true as of PR0's scaffold) — Red Aliados must
   never offer its own sign-up, only accept V2-issued sessions.
4. Set `apps/web/.env` (copy from `.env.example`, gitignored) to the real
   project's `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`.
5. Confirm end-to-end: a real V2-issued JWT, when read via
   `supabase.auth.getClaims()`, resolves `tenant_id`/`role`/`red_aliados_enabled`
   claims that `apps/web/src/features/identity-bridge/domain/session-claims.ts`'s
   `parseSessionClaims` accepts. Re-run this PR's Playwright specs against a
   real session once that's true (they currently mock the session — see
   `apps/web/e2e/identity-bridge.spec.ts`).
6. Only after the above is verified, consider Third-Party Auth "configured"
   — update this file's Status line, don't just assume it from the presence
   of `.env` values.

## Local CLI config (not attempted)

The Supabase CLI's `config.toml` may support a `[auth.third_party.*]`
section for local development (mirroring the dashboard setting for hosted
projects). This was deliberately **not** added to
`supabase/config.toml` in this PR: the exact keys/shape for a fully generic
JWKS issuer (as opposed to the CLI's built-in named providers like Firebase/
Auth0/AWS Cognito) were not verified against a running Supabase CLI in this
environment, and guessing wrong keys risks silently no-op'ing or breaking
`supabase start`. Whoever runs step 2 above with real CLI access should
confirm the correct `config.toml` keys from Supabase's current docs and add
them here (and to `config.toml`) at that time, rather than trusting a guess
committed without verification.
