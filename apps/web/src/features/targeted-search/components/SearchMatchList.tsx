// Presentational (spec: Own-Inventory-First Search, Opt-In Fan-Out to
// Connected Tenants Only, No Auto-Share; Explicit Proceed Fires Opportunity
// Event). Renders whatever `matches` it is given, already ordered
// own-inventory-first by the caller (../hooks/useSearchMatches.ts's own
// domain.orderMatchesOwnInventoryFirst call) -- this component does not
// re-sort. Never talks to ../data or ../hooks directly, same "pure render"
// rule every other presentational component in this codebase follows
// (CandidateCard/ConnectionRequestCard/RequestConnectionButton/MessageThread).
//
// No Auto-Share, enforced here as a client-only view gate
// (../domain/match-view-gate.ts): a `network`-sourced match starts
// 'unviewed' and its Proceed control stays disabled until the requester
// explicitly clicks "View match" -- clicking it fires NO callback prop at
// all (no onView passed to this component, on purpose), it only flips local
// component state. Proceeding is only ever meaningful for a `network` match
// (a `search_match`-origin connection_requests row to act on); an
// `own_inventory` match never renders a view gate or Proceed control at all
// -- there is nothing to "proceed" on your own inventory.
import { useState } from "react";
import { isMatchActionable, type MatchViewState, markMatchViewed } from "../domain/match-view-gate";
import type { SearchMatch } from "../hooks/useSearchMatches";

export interface SearchMatchListProps {
  readonly matches: readonly SearchMatch[];
  readonly fanOutEnabled: boolean;
  readonly isOptingIn?: boolean;
  readonly isProceeding?: boolean;
  readonly onOptInFanOut: () => void;
  readonly onProceed: (match: SearchMatch) => void;
}

export function SearchMatchList({
  matches,
  fanOutEnabled,
  isOptingIn = false,
  isProceeding = false,
  onOptInFanOut,
  onProceed,
}: SearchMatchListProps) {
  const [viewState, setViewState] = useState<Record<string, MatchViewState>>({});

  function viewStateFor(matchId: string): MatchViewState {
    return viewState[matchId] ?? "unviewed";
  }

  function handleView(matchId: string) {
    setViewState((current) => ({
      ...current,
      [matchId]: markMatchViewed(viewStateFor(matchId)),
    }));
  }

  return (
    <section data-testid="search-match-list" className="flex flex-col gap-3">
      {!fanOutEnabled ? (
        <button
          type="button"
          data-testid="search-match-optin-button"
          disabled={isOptingIn}
          onClick={onOptInFanOut}
          className="rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
        >
          Extend search to my network
        </button>
      ) : null}

      <ul className="flex flex-col gap-2">
        {matches.map((match) => {
          const isNetwork = match.source === "network";
          const actionable = isMatchActionable(viewStateFor(match.id));

          return (
            <li
              key={match.id}
              data-testid="search-match-item"
              data-source={match.source}
              className="rounded border border-slate-200 p-3"
            >
              <p data-testid="search-match-vehicle" className="text-sm font-medium">
                {match.make} {match.model}
              </p>

              {isNetwork ? (
                <div className="mt-2 flex items-center gap-2">
                  <button
                    type="button"
                    data-testid="search-match-view-button"
                    onClick={() => handleView(match.id)}
                    className="rounded border border-slate-300 px-2 py-1 text-xs font-medium"
                  >
                    View match
                  </button>
                  <button
                    type="button"
                    data-testid="search-match-proceed-button"
                    disabled={!actionable || isProceeding}
                    onClick={() => onProceed(match)}
                    className="rounded bg-emerald-600 px-2 py-1 text-xs font-medium text-white disabled:opacity-50"
                  >
                    Proceed
                  </button>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
