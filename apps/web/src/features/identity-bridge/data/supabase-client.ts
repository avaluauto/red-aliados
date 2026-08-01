// The single Supabase client instance for the app. This is the ONLY place in
// identity-bridge (and, per design.md's hexagonal-lite split, in the whole
// app) that is allowed to import @supabase/supabase-js directly -- `domain/`
// stays pure, other features' `data/` adapters should reuse this client
// rather than constructing their own.

import type { Database } from "@red-aliados/contracts/db";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// red-aliados does not have its own live Supabase project yet -- task 2.1
// (Third-Party Auth / JWKS config) is documented in
// supabase/THIRD_PARTY_AUTH.md but has not been run against a real project.
// Rather than crash `pnpm --filter web dev`/`build` for every contributor
// until that happens, fall back to a placeholder client: every call against
// it fails closed (network/DNS error), which `fetchSessionResult` in
// `./session` already treats as "no session" -- not a fabricated
// authenticated state.
const PLACEHOLDER_URL = "https://red-aliados-placeholder.supabase.co";
const PLACEHOLDER_ANON_KEY = "red-aliados-placeholder-anon-key";

if (!supabaseUrl || !supabaseAnonKey) {
  // eslint-disable-next-line no-console -- intentional operator-facing signal, not app UI copy
  console.warn(
    "[identity-bridge] VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY are not set -- using a placeholder Supabase client. " +
      "Sign-in will not work until a real project is configured (see supabase/THIRD_PARTY_AUTH.md).",
  );
}

export const supabaseClient: SupabaseClient<Database> = createClient<Database>(
  supabaseUrl || PLACEHOLDER_URL,
  supabaseAnonKey || PLACEHOLDER_ANON_KEY,
);
