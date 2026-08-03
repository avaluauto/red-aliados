// Public surface of partner-reputation. Other features/routes import from
// here, never reaching into ./domain, ./data, ./hooks, ./components directly
// (same convention as identity-bridge/network-authorization/tenant-directory/
// network-connections).
export { ReputationBadge, type ReputationBadgeProps } from "./components/ReputationBadge";
export { fetchReputationEvents } from "./data/reputation-events-queries";
export type {
  ReputationEventInput,
  ReputationEventType,
  ReputationScoreResult,
} from "./domain/reputation-score";
export { computeReputationScore, EXPIRY_WINDOW_SECONDS } from "./domain/reputation-score";
export type { UseReputationScoreResult } from "./hooks/useReputationScore";
export { useReputationScore } from "./hooks/useReputationScore";
