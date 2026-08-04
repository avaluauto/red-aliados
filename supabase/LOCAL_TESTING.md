# Local testing without V2 (task: coordinate Third-Party Auth with V2 first)

## Status: DB/backend side done, 3 manual Studio steps left

Third-Party Auth (real V2 JWT trust, `supabase/THIRD_PARTY_AUTH.md`) is
blocked on a decision + JWKS URL from the V2 team. Until that's coordinated,
this sets up a way to exercise the **entire** app flow against the real
red-aliados Supabase project using Supabase's own native auth (email/
password) instead of a V2-issued JWT, via a Custom Access Token Hook that
injects the same `tenant_id`/`app_role`/`red_aliados_enabled` claims
identity-bridge already expects. See `0011_test_access_token_hook.sql`.

None of this touches or depends on V2. It's a stand-in, not a shortcut
around the real integration -- `THIRD_PARTY_AUTH.md` still governs what
"actually configured" means.

## What's already done (this session)

- `app.test_identity_claims` table + `public.custom_access_token_hook()`
  function applied (`0011_test_access_token_hook.sql`, tracked migration --
  inert for real V2 traffic, safe to leave permanently).
- Test data (NOT a tracked migration -- throwaway, see Teardown below):
  - Tenant A `a0000000-0000-4000-8000-000000000001` "Concesionaria Test Norte"
    -- vehicles `b...0001` (Toyota Corolla) and `b...0002` (Ford Ranger).
  - Tenant B `a0000000-0000-4000-8000-000000000002` "Concesionaria Test Sur"
    -- vehicles `b...0003` (Chevrolet Onix) and `b...0004` (VW Amarok).
- `apps/web/src/features/identity-bridge/domain/session-claims.ts` now reads
  `app_role` instead of `role` (was the flagged-but-unresolved claim
  collision in `THIRD_PARTY_AUTH.md` -- confirmed for real while building
  this: PostgREST reserves top-level `role` for `SET ROLE`, so setting it to
  a dealer role string breaks every `to authenticated` RLS policy). All
  affected unit + e2e fixtures updated to match; `pnpm test:unit` passes
  (221/221).
- `apps/web/src/features/identity-bridge/data/supabase-client.ts` exposes
  `window.supabaseClient` in dev builds only, so you can also sign in from
  the browser console as a scripting shortcut. As of the landing-page work,
  there's now an in-app sign-in form too (email/password, on the public
  landing page's header -- see `components/SignInForm.tsx`) that calls the
  same `signInWithPassword` against this same test-only setup; either path
  works.

## What you still need to do (Supabase Studio -- no MCP tool covers these)

1. **Create a test user.** Studio -> Authentication -> Users -> Add user.
   Use a real email format (doesn't need to be deliverable) + a password
   you'll remember. Do **not** flip the project's public signup setting --
   this admin "Add user" action works regardless, and `enable_signup` must
   stay `false` per `THIRD_PARTY_AUTH.md` (Red Aliados never offers its own
   sign-up).
2. **Enable the hook.** Studio -> Authentication -> Hooks -> enable
   "Customize Access Token (JWT) Claims hook" -> select
   `public.custom_access_token_hook`.
3. **Tell me the email you used.** I'll look up the user's `auth.users.id`
   and insert the mapping row, e.g. for Tenant A:
   ```sql
   insert into app.test_identity_claims (user_id, tenant_id, app_role, red_aliados_enabled)
   values ('<their auth.users.id>', 'a0000000-0000-4000-8000-000000000001', 'dealer_admin', true);
   ```
   Repeat with a second user + Tenant B's id if you want to test both sides
   of a connection (accept/reject, messaging) with two real sessions instead
   of one.

## Signing in once that's done

```bash
pnpm dev
```

Open `http://localhost:5173`, open the browser devtools console, and run:

```js
await window.supabaseClient.auth.signInWithPassword({
  email: "your-test-user@example.com",
  password: "the password you set",
});
```

Reload the page. The session persists in `localStorage` the same way a real
one would, so every existing code path (`fetchSessionResult`,
`useSessionClaims`, the RLS-enforced Supabase queries) runs unmodified --
nothing in the app itself knows this session came from a test hook instead
of V2.

## Teardown (once Third-Party Auth with V2 is actually configured)

```sql
delete from public.vehicle_snapshots where tenant_id in
  ('a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000002');
delete from public.tenant_contacts where tenant_id in
  ('a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000002');
delete from public.tenants where id in
  ('a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000002');
-- app.test_identity_claims rows cascade-delete with their tenant.
```

Then, in Studio -> Authentication -> Hooks, disable the Custom Access Token
Hook, delete the test `auth.users` rows, and drop
`0011_test_access_token_hook.sql`'s objects (`app.test_identity_claims`,
`public.custom_access_token_hook`) in a follow-up migration.
