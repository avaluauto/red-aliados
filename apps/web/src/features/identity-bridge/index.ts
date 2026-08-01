// Public surface of identity-bridge. Other features/the app shell import
// from here, never reaching into ./domain, ./data, ./hooks directly.
export { IdentityGate } from "./components/IdentityGate";
export type { SessionClaims, SessionClaimsResult } from "./domain/session-claims";
export { isModuleEnabled, parseSessionClaims } from "./domain/session-claims";
export type { SessionState } from "./hooks/useSessionClaims";
export { useSessionClaims } from "./hooks/useSessionClaims";
