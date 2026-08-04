// Public surface of identity-bridge. Other features/the app shell import
// from here, never reaching into ./domain, ./data, ./hooks directly.
export { IdentityGate } from "./components/IdentityGate";
// Marketing/root-host landing page. The app shell (routes/__root.tsx) renders
// it directly for the non-"app." host branch -- see host-mode.ts. It's no
// longer IdentityGate's unauthenticated fallback (see
// SessionUnavailableState.tsx).
export { PublicLandingShell } from "./components/PublicLandingShell";
export type { SignInFormProps } from "./components/SignInForm";
// SignInForm is reused as-is by the dedicated /login route
// (apps/web/src/routes/login.tsx) -- see that component's own doc-comment
// for what it currently authenticates against.
export { SignInForm } from "./components/SignInForm";
// The single Supabase client instance, exported per supabase-client.ts's own
// top comment ("other features' data/ adapters should reuse this client
// rather than constructing their own") -- tenant-directory (PR5) is the
// first consumer.
export { supabaseClient } from "./data/supabase-client";
export type { SessionClaims, SessionClaimsResult } from "./domain/session-claims";
export { isModuleEnabled, parseSessionClaims } from "./domain/session-claims";
export type { SessionState } from "./hooks/useSessionClaims";
export { useSessionClaims } from "./hooks/useSessionClaims";
