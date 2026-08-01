import { createFileRoute } from "@tanstack/react-router";
import {
  ConnectionRequestCard,
  type ConnectionRequestStatus,
  resolveEffectiveStatus,
  useAcceptConnectionRequest,
  useActOnSuggestedRequest,
  useConnectionEdgesForRequest,
  useRejectConnectionRequest,
} from "@/features/network-connections";

// E2E-ONLY test harness (task 6.5), never linked from real navigation. Wires
// the real ConnectionRequestCard component + useActOnSuggestedRequest/
// useAcceptConnectionRequest/useRejectConnectionRequest/
// useConnectionEdgesForRequest hooks together, exercising the actual
// mutation call shape (supabaseClient.from("connection_requests").update(...))
// in a real browser. Scenario inputs (requestId/status/expiresAt) are seeded
// via URL search params by apps/web/e2e/network-connections.spec.ts, which
// intercepts the underlying PostgREST calls via `page.route` -- there is no
// live Supabase project to round-trip against yet (same documented
// verification gap as PR2/PR3/PR4/PR5's harnesses). What THIS proves is the
// CLIENT wiring end-to-end (hook -> mutation -> re-query -> render); the
// reciprocal-edges INSERT itself is the job of the DB trigger
// (app.handle_connection_request_transition, supabase/migrations/
// 0006_pg_cron_expire_requests.sql), which is not exercised here -- the
// mocked response for the edges GET stands in for what that trigger would
// have produced.
export const Route = createFileRoute("/e2e-network-connections")({
  component: NetworkConnectionsHarnessRoute,
});

function NetworkConnectionsHarnessRoute() {
  if (import.meta.env.MODE !== "e2e") {
    return null;
  }

  return <NetworkConnectionsHarness />;
}

function NetworkConnectionsHarness() {
  const params = new URLSearchParams(window.location.search);
  const requestId = params.get("requestId") ?? "";
  const seededStatus = (params.get("status") ?? "pending") as ConnectionRequestStatus;
  const expiresAtParam = params.get("expiresAt");
  const expiresAt = expiresAtParam ? new Date(expiresAtParam) : null;
  const respondedBy = params.get("respondedBy") ?? "44444444-4444-4444-8444-444444444444";

  const actOnSuggestion = useActOnSuggestedRequest();
  const accept = useAcceptConnectionRequest();
  const reject = useRejectConnectionRequest();
  const edgesQuery = useConnectionEdgesForRequest(requestId);

  // Once a mutation resolves, its own response is the freshest known status
  // (mirrors what a real container would do: use the mutation's returned row
  // rather than re-fetching). Falls back to the URL-seeded status/expiresAt
  // otherwise, then to the client-side expiry preview
  // (resolveEffectiveStatus) so an already-past-expiry seed renders as
  // 'expired' without needing any mutation at all.
  const latestStatus =
    actOnSuggestion.data?.status ?? accept.data?.status ?? reject.data?.status ?? null;
  const effectiveStatus: ConnectionRequestStatus = latestStatus
    ? (latestStatus as ConnectionRequestStatus)
    : resolveEffectiveStatus({ status: seededStatus, expiresAt }, new Date());

  const isBusy = actOnSuggestion.isPending || accept.isPending || reject.isPending;
  const edgesCreated = effectiveStatus === "accepted" ? (edgesQuery.data?.length ?? 0) : 0;

  return (
    <main>
      <ConnectionRequestCard
        status={effectiveStatus}
        viewerRole="recipient"
        isBusy={isBusy}
        edgesCreated={edgesCreated}
        onActOnSuggestion={() => actOnSuggestion.mutate(requestId)}
        onAccept={() => accept.mutate({ requestId, respondedBy })}
        onReject={() => reject.mutate({ requestId, respondedBy })}
      />
    </main>
  );
}
