// Public surface of tenant-directory. Other features/routes import from
// here, never reaching into ./domain, ./data, ./hooks, ./components
// directly (same convention as identity-bridge/network-authorization).
export { CandidateCard } from "./components/CandidateCard";
export type { ReputationSummary, TenantDirectoryEntry } from "./data/tenant-directory-queries";
export { isContactRevealed, isReputationVisible } from "./domain/visibility-rules";
export type { ConnectionState } from "./hooks/useConnectionState";
export { useConnectionState } from "./hooks/useConnectionState";
export type { TenantDirectoryEntryResult } from "./hooks/useTenantDirectoryEntry";
export { useTenantDirectoryEntry } from "./hooks/useTenantDirectoryEntry";
