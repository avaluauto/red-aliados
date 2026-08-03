// Presentational (spec: 48-Hour Expiry with Double Opt-In, Suggested Status
// for Seeded Requests). Purely renders `status`/`viewerRole` and fires the
// caller-supplied action callbacks -- never talks to ../data or ../hooks
// directly, same convention CandidateCard established in tenant-directory.
// A container (route/page) composes this with useActOnSuggestedRequest/
// useAcceptConnectionRequest/useRejectConnectionRequest and passes the
// caller-resolved *effective* status (domain/connection-lifecycle.ts's
// resolveEffectiveStatus) so this component never has to know about clocks.
import type { ConnectionRequestStatus } from "../domain/connection-lifecycle";
import { canActOnSuggestion, canRespond } from "../domain/connection-lifecycle";

export type ConnectionRequestViewerRole = "requester" | "recipient";

export interface ConnectionRequestCardProps {
  readonly status: ConnectionRequestStatus;
  readonly viewerRole: ConnectionRequestViewerRole;
  readonly isBusy?: boolean;
  /** Reciprocal connection_edges count once the request reaches 'accepted' (0 otherwise). */
  readonly edgesCreated?: number;
  readonly onActOnSuggestion?: () => void;
  readonly onAccept?: () => void;
  readonly onReject?: () => void;
}

const STATUS_LABEL: Record<ConnectionRequestStatus, string> = {
  suggested: "Suggested",
  pending: "Pending",
  accepted: "Connected",
  rejected: "Rejected",
  expired: "Expired",
};

export function ConnectionRequestCard({
  status,
  viewerRole,
  isBusy = false,
  edgesCreated,
  onActOnSuggestion,
  onAccept,
  onReject,
}: ConnectionRequestCardProps) {
  const showEngage = viewerRole === "recipient" && canActOnSuggestion(status);
  const showRespond = viewerRole === "recipient" && canRespond(status);

  return (
    <article
      data-testid="connection-request-card"
      data-status={status}
      className="flex flex-col gap-2 rounded-lg border border-slate-200 p-4"
    >
      <p data-testid="connection-request-status" className="text-sm font-semibold">
        {status} ({STATUS_LABEL[status]})
      </p>

      {typeof edgesCreated === "number" ? (
        <p data-testid="connection-request-edges-count" className="text-xs text-slate-500">
          {edgesCreated}
        </p>
      ) : null}

      {showEngage ? (
        <button
          type="button"
          data-testid="connection-request-engage-button"
          disabled={isBusy}
          onClick={onActOnSuggestion}
          className="rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
        >
          Engage
        </button>
      ) : null}

      {showRespond ? (
        <div className="flex gap-2">
          <button
            type="button"
            data-testid="connection-request-accept-button"
            disabled={isBusy}
            onClick={onAccept}
            className="rounded bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            Accept
          </button>
          <button
            type="button"
            data-testid="connection-request-reject-button"
            disabled={isBusy}
            onClick={onReject}
            className="rounded bg-red-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            Reject
          </button>
        </div>
      ) : null}
    </article>
  );
}
