-- 0009_fix_insert_own_request_provenance.sql
-- Corrective fix (post-merge-review gatekeeper finding during PR9
-- targeted-search review) for a CRITICAL gap rooted in PR1's
-- insert_own_request policy (0003_rls_policies.sql, lines ~160-167). Do NOT
-- hand-edit 0001-0008 -- this migration only adds provenance validation on
-- top of the existing policy, additive tightening, not a rewrite of its
-- intent.
--
-- THE GAP: insert_own_request required module_enabled() + has_network_access()
-- + requester_tenant_id = current_tenant_id() + origin_type in
-- ('vehicle_interest', 'search_match') -- but never validated that
-- recipient_tenant_id had any REAL relationship to the row's stated origin:
--   - vehicle_interest: nothing checked that vehicle_snapshot_id actually
--     belongs to recipient_tenant_id.
--   - search_match: nothing checked that search_request_id was a real search
--     the requester was actually fanned into via search_request_targets, or
--     that recipient_tenant_id was that search's real owner.
--
-- Combined with app.has_candidate_link() (0002) granting masked
-- candidate-tier visibility to BOTH parties the instant ANY pending/suggested
-- connection_requests row links them, and vehicle_snapshots_public (0004)
-- exposing raw tenant_id at every visible tier (so target ids are
-- discoverable via legitimate browsing), any network-access-granted tenant
-- could fabricate a single INSERT naming an arbitrary recipient_tenant_id
-- with a fake vehicle_interest or search_match origin -- both spamming an
-- unwanted connection request AND self-granting masked inventory visibility
-- into a tenant it has zero legitimate relationship with. This was a real
-- backdoor around the double opt-in model, first exercised end-to-end by
-- PR9's respondWithMatch search_match path (the gap itself predates PR9 and
-- was already reachable via PR6's vehicle_interest origin).
--
-- THE FIX: insert_own_request is dropped and recreated with two additional
-- provenance checks, one per origin_type, appended to the existing
-- conjuncts (module_enabled/has_network_access/requester_tenant_id/
-- origin_type unchanged):
--   - vehicle_interest: require an EXISTS proving vehicle_snapshot_id
--     genuinely belongs to recipient_tenant_id (public.vehicle_snapshots).
--   - search_match: require an EXISTS proving the requester was genuinely
--     fanned into that exact search (public.search_request_targets row for
--     (search_request_id, requester_tenant_id)) AND that the stated
--     recipient genuinely owns that search (public.search_requests.tenant_id
--     = recipient_tenant_id).
-- origin_type = 'direct' is untouched: it already has no client INSERT
-- policy at all (service-role only, enforced structurally in 0001 by
-- connection_requests_direct_requires_seeded_by), so it is excluded from
-- the origin_type in (...) list before either provenance branch is ever
-- reached.
--
-- Both new checks correctly reject a null vehicle_snapshot_id /
-- search_request_id (a null FK can never satisfy `v.id = null` or
-- `t.search_request_id = null`), closing a secondary variant of the same
-- gap where a client could omit the provenance column entirely.
--
-- IMPLEMENTATION NOTE (discovered by round-tripping this against a real
-- Postgres, not assumed): a raw `exists (select ... from
-- public.vehicle_snapshots ...)` inline in the WITH CHECK does NOT work,
-- for two independent reasons mirroring app.vehicle_snapshot_visible()'s own
-- header comment in 0002 --
--   1. 0004_public_views.sql revokes SELECT on public.vehicle_snapshots from
--      `authenticated` entirely (reads must go through
--      vehicle_snapshots_public) -- a raw subquery against the base table
--      fails with `permission denied for table vehicle_snapshots`, for
--      every caller, legitimate or not.
--   2. select_own_search_request_targets (0003) scopes SELECT on
--      search_request_targets to the search's OWNING tenant only
--      (`sr.tenant_id = app.current_tenant_id()`) -- the RESPONDING tenant
--      (the search_match requester here) is never that owner, so even a
--      genuinely fanned-in responder's own subquery would see zero rows
--      under their own RLS, not because the data is wrong but because they
--      have no SELECT visibility into that table at all under their own
--      role.
-- Both are solved the same way 0002 already solved this exact class of
-- problem for vehicle_snapshot_photos: two new SECURITY DEFINER helper
-- functions (app.vehicle_snapshot_owned_by, app.search_match_provenance_valid)
-- that read the base tables with the function owner's privileges,
-- sidestepping both the revoked grant and the narrower RLS scope, while
-- still only ever answering the single boolean question the policy needs.
--
-- Verified for real against a disposable local Postgres 17 database (own
-- throwaway initdb cluster on a scratch port, not the shared Laragon
-- instance, with a hand-rolled stand-in for the roles/auth.jwt()/auth.uid()
-- the real Supabase platform bootstrap normally provides -- same approach
-- 0006/0007/0008 documented): pre-fix, both the vehicle_interest and
-- search_match exploit shapes (naming an uninvolved recipient_tenant_id with
-- no real relationship) succeeded; post-fix (this migration applied), both
-- are rejected by RLS (`new row violates row-level security policy`), while
-- a genuine vehicle_interest request (recipient truly owns the referenced
-- vehicle) and a genuine search_match response (responder truly fanned into
-- the search, recipient truly owns it) both still succeed unchanged. See
-- supabase/tests/database/0009_insert_own_request_provenance.test.sql for
-- the pgTAP-shaped regression assertions.
--
-- CORRECTIVE ADDENDUM (found by independent fresh-context re-verification of
-- this same migration, fixed in place before this migration was ever
-- committed): the two SECURITY DEFINER helpers below originally performed
-- zero internal authorization gating of their own. Because the `app` schema
-- is listed in supabase/config.toml's exposed `schemas`, both were directly
-- callable via PostgREST RPC (POST /rest/v1/rpc/vehicle_snapshot_owned_by,
-- .../rpc/search_match_provenance_valid) by ANY authenticated user, tenant
-- module state notwithstanding -- a cross-tenant relationship-confirmation
-- oracle bypassing layers 1 (module_enabled) and 3 (has_network_access) of
-- the Four-Layer Authorization model, inconsistent with every other app.*
-- helper in this codebase. Both functions now gate on module_enabled() and
-- has_network_access() first, returning false immediately, mirroring
-- app.visibility_tier()'s (0002) established early-return idiom. Verified
-- against the same disposable cluster: a caller with module_enabled() =
-- false, or with module_enabled() = true but has_network_access() = false,
-- now gets `false` immediately from either function even when the
-- underlying relationship it asks about is genuinely true -- the oracle is
-- closed. The three original exploit shapes and both legitimate flows above
-- were re-verified unchanged after this addition.

-- =============================================================================
-- SECURITY DEFINER provenance helpers -- same rationale/pattern as
-- app.vehicle_snapshot_visible() (0002): a policy's WITH CHECK subquery runs
-- as the calling role (authenticated), which does not have the SELECT
-- visibility these checks need on the raw base tables (see IMPLEMENTATION
-- NOTE above). Each reads the minimum it needs and returns only a boolean.
-- =============================================================================

-- GATING NOTE (post-merge re-verification finding, fresh-context gatekeeper
-- review of this same migration): the `app` schema is listed in
-- supabase/config.toml's exposed `schemas`, so both helpers below are
-- directly PostgREST-callable (POST /rest/v1/rpc/<function_name>) by ANY
-- authenticated user, independent of insert_own_request's own top-level
-- module_enabled()/has_network_access() conjuncts. Unlike every other
-- app.* helper (app.has_network_access, app.is_connected,
-- app.has_candidate_link, app.visibility_tier, app.vehicle_snapshot_visible),
-- these two originally performed zero internal gating -- a tenant whose
-- Red Aliados module is disabled/absent, or who has no granted network
-- user, could still call them directly and get a correct true/false
-- cross-tenant relationship answer: a boolean oracle bypassing layers 1 and
-- 3 of the Four-Layer Authorization model. Both functions now gate on
-- layer 1 (app.module_enabled()) and layer 3 (app.has_network_access())
-- FIRST, returning false immediately before touching the base tables --
-- the exact early-return idiom app.visibility_tier() (0002) already
-- established for composing these same two layers. This is redundant with
-- insert_own_request's own WITH CHECK conjuncts for the policy's own
-- legitimate use (defense in depth, same spirit as the RLS fixes elsewhere
-- in this project), but it is what actually closes the direct-RPC oracle
-- path for any caller who bypasses the policy and calls the function
-- standalone.
create or replace function app.vehicle_snapshot_owned_by(target_vehicle_id uuid, target_tenant_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  -- Layer 1 first, always -- cheapest fail, mirrors app.visibility_tier().
  if not app.module_enabled() then
    return false;
  end if;

  -- Layer 3: no cross-tenant relationship confirmation without a granted
  -- network user -- this function is PostgREST-exposed, so it must self-gate
  -- instead of relying solely on insert_own_request's own conjuncts.
  if not app.has_network_access() then
    return false;
  end if;

  return exists (
    select 1
    from public.vehicle_snapshots v
    where v.id = target_vehicle_id
      and v.tenant_id = target_tenant_id
  );
end;
$$;

comment on function app.vehicle_snapshot_owned_by(uuid, uuid) is
  'Does target_vehicle_id genuinely belong to target_tenant_id? Used by insert_own_request (0009) to validate vehicle_interest provenance -- SECURITY DEFINER because vehicle_snapshots'' base-table SELECT is revoked from authenticated (0004). Gates on module_enabled()/has_network_access() first (mirrors app.visibility_tier()) because the app schema is PostgREST-exposed and this function is directly callable via RPC.';

create or replace function app.search_match_provenance_valid(
  target_search_request_id uuid,
  target_requester_tenant_id uuid,
  target_recipient_tenant_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  -- Layer 1 first, always -- cheapest fail, mirrors app.visibility_tier().
  if not app.module_enabled() then
    return false;
  end if;

  -- Layer 3: no cross-tenant relationship confirmation without a granted
  -- network user -- this function is PostgREST-exposed, so it must self-gate
  -- instead of relying solely on insert_own_request's own conjuncts.
  if not app.has_network_access() then
    return false;
  end if;

  return exists (
    select 1
    from public.search_request_targets t
    join public.search_requests s on s.id = t.search_request_id
    where t.search_request_id = target_search_request_id
      and t.target_tenant_id = target_requester_tenant_id
      and s.tenant_id = target_recipient_tenant_id
  );
end;
$$;

comment on function app.search_match_provenance_valid(uuid, uuid, uuid) is
  'Was target_requester_tenant_id genuinely fanned into target_search_request_id (search_request_targets), and is target_recipient_tenant_id genuinely that search''s real owner (search_requests.tenant_id)? Used by insert_own_request (0009) to validate search_match provenance -- SECURITY DEFINER because select_own_search_request_targets (0003) scopes SELECT to the search''s owning tenant only, never the responding tenant this check is called for. Gates on module_enabled()/has_network_access() first (mirrors app.visibility_tier()) because the app schema is PostgREST-exposed and this function is directly callable via RPC.';

revoke execute on function app.vehicle_snapshot_owned_by(uuid, uuid) from public;
revoke execute on function app.search_match_provenance_valid(uuid, uuid, uuid) from public;
grant execute on function app.vehicle_snapshot_owned_by(uuid, uuid) to authenticated;
grant execute on function app.search_match_provenance_valid(uuid, uuid, uuid) to authenticated;

drop policy insert_own_request on public.connection_requests;

create policy insert_own_request on public.connection_requests
  for insert to authenticated
  with check (
    app.module_enabled()
    and app.has_network_access()
    and requester_tenant_id = app.current_tenant_id()
    and origin_type in ('vehicle_interest', 'search_match')
    -- Provenance (vehicle_interest): the referenced vehicle must genuinely
    -- belong to the stated recipient tenant -- otherwise any discoverable
    -- tenant_id (vehicle_snapshots_public leaks it unmasked, 0004) could be
    -- named as recipient with a fabricated vehicle_snapshot_id.
    and (
      origin_type <> 'vehicle_interest'
      or app.vehicle_snapshot_owned_by(vehicle_snapshot_id, recipient_tenant_id)
    )
    -- Provenance (search_match): the requester must genuinely have been
    -- fanned into that search (search_request_targets), and the stated
    -- recipient must genuinely be that search's real owner
    -- (search_requests.tenant_id) -- otherwise a fabricated search_request_id
    -- naming an uninvolved recipient would pass unchecked.
    and (
      origin_type <> 'search_match'
      or app.search_match_provenance_valid(search_request_id, requester_tenant_id, recipient_tenant_id)
    )
  );

comment on policy insert_own_request on public.connection_requests is
  'The ONLY insert policy for authenticated. origin_type restricted to vehicle_interest/search_match (direct has deliberately no client insert path, see 0001/0003 headers). Additive provenance tightening (0009): vehicle_interest requires the referenced vehicle to genuinely belong to recipient_tenant_id; search_match requires the requester to genuinely have been fanned into that search via search_request_targets AND recipient_tenant_id to genuinely be that search''s real owner -- closes a backdoor that let any network-access-granted tenant fabricate an unwanted request (and self-grant candidate-tier visibility via app.has_candidate_link()) against an arbitrary, uninvolved tenant.';
