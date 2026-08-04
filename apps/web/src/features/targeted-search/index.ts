// Public surface of targeted-search ("Conseguir"). Other features/routes
// import from here, never reaching into ./domain, ./data, ./hooks,
// ./components directly (same convention as identity-bridge/
// network-authorization/tenant-directory/network-connections/
// partner-reputation/connection-messaging).
export { SearchMatchList, type SearchMatchListProps } from "./components/SearchMatchList";
export { SearchRequestForm, type SearchRequestFormProps } from "./components/SearchRequestForm";
export type {
  CreateSearchRequestInput,
  FanOutMatchRow,
  OptInToFanOutResult,
  ProceedOnMatchInput,
  RespondWithMatchInput,
  SearchOpportunityRow,
  SearchRequestRow,
  SearchRequestTargetRow,
  VehicleSnapshotPublicRow,
} from "./data/targeted-search-queries";
export {
  createSearchRequest,
  fetchConnectedTenantIds,
  fetchFanOutMatches,
  fetchOwnInventoryVehicles,
  fetchOwnSearchRequests,
  optInToFanOut,
  proceedOnMatch,
  respondWithMatch,
} from "./data/targeted-search-queries";
export {
  INITIAL_MATCH_VIEW_STATE,
  isMatchActionable,
  type MatchViewState,
  markMatchViewed,
} from "./domain/match-view-gate";
export {
  filterConnectedFanOutTargets,
  orderMatchesOwnInventoryFirst,
  type SearchMatchLike,
  type SearchMatchSource,
} from "./domain/search-matching";
export { useCreateSearchRequest } from "./hooks/useCreateSearchRequest";
export { type OptInFanOutInput, useOptInFanOut } from "./hooks/useOptInFanOut";
export { useOwnSearchRequests } from "./hooks/useOwnSearchRequests";
export { useProceedOnMatch } from "./hooks/useProceedOnMatch";
export { useRespondWithMatch } from "./hooks/useRespondWithMatch";
export {
  type SearchMatch,
  type UseSearchMatchesInput,
  type UseSearchMatchesResult,
  useSearchMatches,
} from "./hooks/useSearchMatches";
