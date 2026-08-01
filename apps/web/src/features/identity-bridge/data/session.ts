// Session bootstrap adapter (spec: Federated JWT Trust, Claim Contract).
// Reads whatever session Supabase's client already resolved -- never writes
// a local user row, never renders/handles a login form. Claim SHAPE
// validation lives in ../domain/session-claims.ts, kept deliberately out of
// this file so domain/ never needs to import Supabase.
import { supabaseClient } from "./supabase-client";

export type SessionFetchResult =
  | { readonly status: "authenticated"; readonly rawClaims: unknown }
  | { readonly status: "unauthenticated" };

declare global {
  var __RED_ALIADOS_E2E_SESSION__: SessionFetchResult | undefined;
}

const isE2eMode = import.meta.env.MODE === "e2e";

/**
 * Reads the current session's JWT claims via the Supabase client.
 * `auth.getClaims()` verifies the V2-issued JWT locally against the
 * configured JWKS (see supabase/THIRD_PARTY_AUTH.md for task 2.1's config)
 * without ever creating/caching/storing a local user record.
 *
 * Test-only seam: in `e2e` build mode ONLY (`vite build --mode e2e`, see
 * package.json's `build:e2e` script), a Playwright test can pre-seed
 * `globalThis.__RED_ALIADOS_E2E_SESSION__` via `page.addInitScript` to
 * bypass the real Supabase call -- there is no live Supabase project
 * reachable yet (task 2.1 is a documented config step, not an executed
 * one). Normal dev/production builds never read this global.
 */
export async function fetchSessionResult(): Promise<SessionFetchResult> {
  if (isE2eMode && typeof globalThis.__RED_ALIADOS_E2E_SESSION__ !== "undefined") {
    return globalThis.__RED_ALIADOS_E2E_SESSION__;
  }

  const { data, error } = await supabaseClient.auth.getClaims();

  if (error || !data?.claims) {
    return { status: "unauthenticated" };
  }

  return { status: "authenticated", rawClaims: data.claims };
}

/** Subscribes to Supabase auth state changes; returns an unsubscribe function. */
export function subscribeToAuthChanges(onChange: () => void): () => void {
  const {
    data: { subscription },
  } = supabaseClient.auth.onAuthStateChange(() => {
    onChange();
  });

  return () => subscription.unsubscribe();
}
