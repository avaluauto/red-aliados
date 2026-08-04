// Public surface of network-connections. Other features/routes import from
// here, never reaching into ./domain, ./data, ./hooks, ./components
// directly (same convention as identity-bridge/network-authorization/tenant-directory).
export type {
  ConnectionRequestCardProps,
  ConnectionRequestViewerRole,
} from "./components/ConnectionRequestCard";
export { ConnectionRequestCard } from "./components/ConnectionRequestCard";
export type { RequestConnectionButtonProps } from "./components/RequestConnectionButton";
export { RequestConnectionButton } from "./components/RequestConnectionButton";
export type {
  ConnectionEdgeRow,
  ConnectionRequestRow,
  CreateConnectionRequestInput,
  MyConnectionEdge,
} from "./data/connection-requests-queries";
export {
  acceptConnectionRequest,
  actOnSuggestedRequest,
  createConnectionRequest,
  fetchConnectionEdgesForRequest,
  fetchMyConnectionEdges,
  fetchMyConnectionRequests,
  fetchMyPendingConnectionRequests,
  rejectConnectionRequest,
} from "./data/connection-requests-queries";
export type {
  ClientCreatableOriginType,
  ConnectionRequestLike,
  ConnectionRequestOriginType,
  ConnectionRequestStatus,
  TransitionOutcome,
  TransitionResult,
} from "./domain/connection-lifecycle";
export {
  applyTransition,
  canActOnSuggestion,
  canRespond,
  computeExpiresAt,
  EXPIRY_WINDOW_HOURS,
  isPastExpiry,
  isValidTransition,
  reciprocalEdgeTenantPairs,
  resolveEffectiveStatus,
} from "./domain/connection-lifecycle";
export { useConnectionEdgesForRequest } from "./hooks/useConnectionEdgesForRequest";
export { useCreateConnectionRequest } from "./hooks/useCreateConnectionRequest";
export { useMyConnectionEdges } from "./hooks/useMyConnectionEdges";
export { useMyConnectionRequests } from "./hooks/useMyConnectionRequests";
export { useMyPendingConnectionRequests } from "./hooks/useMyPendingConnectionRequests";
export type { RespondToConnectionRequestInput } from "./hooks/useRespondToConnectionRequest";
export {
  useAcceptConnectionRequest,
  useActOnSuggestedRequest,
  useRejectConnectionRequest,
} from "./hooks/useRespondToConnectionRequest";
