// Presentational trigger for creating a connection_requests row (spec:
// Connection Request Origins -- vehicle_interest/search_match, never
// direct). A container composes this with useCreateConnectionRequest and
// supplies requesterTenantId/recipientTenantId/originType/requestedBy; this
// component itself never talks to ../data or ../hooks (same convention as
// ConnectionRequestCard/CandidateCard).
//
// tenant-directory's CandidateCard (PR5) is exactly where a real product
// surface would eventually mount this button -- deliberately NOT wired
// there in this PR (out of scope; see PR6 task brief).
export interface RequestConnectionButtonProps {
  readonly onRequest: () => void;
  readonly isBusy?: boolean;
  /** Suppresses the control once a suggested/pending link already exists -- no duplicate request path. */
  readonly alreadyRequested?: boolean;
}

export function RequestConnectionButton({
  onRequest,
  isBusy = false,
  alreadyRequested = false,
}: RequestConnectionButtonProps) {
  if (alreadyRequested) {
    return null;
  }

  return (
    <button
      type="button"
      data-testid="request-connection-button"
      disabled={isBusy}
      onClick={onRequest}
      className="rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
    >
      Request connection
    </button>
  );
}
