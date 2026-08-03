// Sign-in adapter (component-facing mutation), mirrors ./session.ts's
// read-side split: the actual @supabase/supabase-js call stays behind this
// data/ module, components/hooks never import supabase-js directly.
//
// IMPORTANT (mirrors the note in ../components/SignInForm.tsx): this
// currently authenticates against Red Aliados' OWN (test-only) Supabase
// project, via the Custom Access Token Hook stand-in documented in
// supabase/LOCAL_TESTING.md -- it is NOT the real integration with Avaluauto
// V2 (identity-bridge: Federated JWT Trust, supabase/THIRD_PARTY_AUTH.md),
// which has not been coordinated/configured yet. Once V2 exposes its real
// mechanism, only this function's body is expected to change.
import { supabaseClient } from "./supabase-client";

export type SignInParams = {
  readonly email: string;
  readonly password: string;
};

/** Throws (via TanStack Query's `isError`) on invalid credentials or any Supabase error. */
export async function signInWithPassword({ email, password }: SignInParams): Promise<void> {
  const { error } = await supabaseClient.auth.signInWithPassword({ email, password });

  if (error) {
    throw error;
  }

  // No return value on success: `subscribeToAuthChanges` (./session.ts) already
  // picks up the new session and invalidates `useSessionClaims` -- nothing
  // else here needs to know the resulting claims.
}
