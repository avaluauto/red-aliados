// Public surface of network-authorization. Other features import from here,
// never reaching into ./domain, ./hooks directly (same convention as
// identity-bridge/index.ts).

export type { VisibilityTier, VisibilityTierInput } from "./domain/visibility-tier";
export { canAccessTarget, resolveVisibilityTier } from "./domain/visibility-tier";
export { useGuardedQuery } from "./hooks/useGuardedQuery";
export type { UseVisibilityTierInput } from "./hooks/useVisibilityTier";
export { useVisibilityTier } from "./hooks/useVisibilityTier";
