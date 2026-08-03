import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { supabaseClient, useSessionClaims } from "@/features/identity-bridge";
import {
  type ConnectionRequestRow,
  type MyConnectionEdge,
  useAcceptConnectionRequest,
  useActOnSuggestedRequest,
  useMyConnectionEdges,
  useMyPendingConnectionRequests,
  useRejectConnectionRequest,
} from "@/features/network-connections";
import { useTenantDirectoryEntry } from "@/features/tenant-directory";
import { Topbar } from "@/shared/ui/Topbar";

// "Tu red" -- the tenant's own connections plus the inbound requests they
// can act on. There is deliberately NO "discover new aliados" section here:
// the `tenants` table has zero RLS policies for `authenticated` (deny by
// default, see network-authorization's Deny-by-Default Enforcement Point),
// so a tenant only ever becomes visible through an active connection_edges
// row or a suggested/pending connection_requests row -- there is no way to
// browse the network at large, and this page does not pretend otherwise.
// Only composes the already-tested data/hooks layer (features/network-connections,
// features/tenant-directory) -- no query/mutation logic lives here, same
// convention routes/solicitudes.tsx established.
export const Route = createFileRoute("/red")({
  component: RedPage,
});

const PENDING_STATUS_LABEL: Record<"suggested" | "pending", string> = {
  suggested: "Sugerida",
  pending: "Pendiente",
};

/**
 * SessionClaims (identity-bridge/domain/session-claims.ts) carries
 * tenantId/role/redAliadosEnabled but no user id -- accept/reject need one
 * for `responded_by`. Reads it straight from Supabase's own auth user, same
 * pattern routes/solicitudes.tsx already established for this exact gap.
 */
function useCurrentUserId() {
  return useQuery({
    queryKey: ["red", "current-user-id"],
    queryFn: async () => {
      const { data, error } = await supabaseClient.auth.getUser();
      if (error || !data.user) {
        return null;
      }
      return data.user.id;
    },
  });
}

interface PendingRequestCardProps {
  readonly request: ConnectionRequestRow;
  readonly currentUserId: string | null | undefined;
}

/**
 * A single inbound suggested/pending request. There is no name/contact for
 * the requester here on purpose: tenant-directory's own tier masking (a
 * candidate-tier row) hides both until a real connection exists -- this is
 * correct per spec, not a bug to work around, so the card falls back to a
 * plain "Aliado" placeholder and shows only whatever the tier allows
 * (reputation, if visible).
 */
function PendingRequestCard({ request, currentUserId }: PendingRequestCardProps) {
  const directory = useTenantDirectoryEntry(request.requester_tenant_id);
  const actOnSuggestion = useActOnSuggestedRequest();
  const accept = useAcceptConnectionRequest();
  const reject = useRejectConnectionRequest();

  const isSuggested = request.status === "suggested";
  const isPending = request.status === "pending";
  const isBusy = actOnSuggestion.isPending || accept.isPending || reject.isPending;
  const displayName = directory.entry?.tenantName ?? "Aliado";

  function handleActOnSuggestion() {
    actOnSuggestion.mutate(request.id);
  }

  function handleAccept() {
    if (!currentUserId) {
      return;
    }
    accept.mutate({ requestId: request.id, respondedBy: currentUserId });
  }

  function handleReject() {
    if (!currentUserId) {
      return;
    }
    reject.mutate({ requestId: request.id, respondedBy: currentUserId });
  }

  return (
    <article
      data-testid="pending-request-card"
      className="flex flex-col gap-3 rounded-xl border border-border bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex flex-col gap-1">
        <h3 className="font-head text-base font-semibold text-dark">{displayName}</h3>
        <span
          data-testid="pending-request-status"
          className="w-fit rounded-full bg-tint px-3 py-1 text-xs font-semibold uppercase tracking-wide text-primary"
        >
          {isSuggested ? PENDING_STATUS_LABEL.suggested : PENDING_STATUS_LABEL.pending}
        </span>
        {directory.reputationVisible && directory.reputation ? (
          <p data-testid="pending-request-reputation" className="text-xs text-muted">
            {directory.reputation.score !== null
              ? `Reputación: ${directory.reputation.score.toFixed(0)}`
              : "Todavía sin calificar"}
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {isSuggested ? (
          <button
            type="button"
            data-testid="pending-request-engage-button"
            disabled={isBusy}
            onClick={handleActOnSuggestion}
            className="rounded-full bg-primary px-4 py-2 text-xs font-semibold text-white transition-colors hover:opacity-90 disabled:opacity-50"
          >
            Aceptar conexión
          </button>
        ) : null}
        {isPending ? (
          <>
            <button
              type="button"
              data-testid="pending-request-accept-button"
              disabled={isBusy || !currentUserId}
              onClick={handleAccept}
              className="rounded-full bg-primary px-4 py-2 text-xs font-semibold text-white transition-colors hover:opacity-90 disabled:opacity-50"
            >
              Aceptar
            </button>
            <button
              type="button"
              data-testid="pending-request-reject-button"
              disabled={isBusy || !currentUserId}
              onClick={handleReject}
              className="rounded-full border border-border-2 bg-white px-4 py-2 text-xs font-semibold text-dark transition-colors hover:border-primary hover:text-primary disabled:opacity-50"
            >
              Rechazar
            </button>
          </>
        ) : null}
      </div>
    </article>
  );
}

interface ConnectionCardProps {
  readonly edge: MyConnectionEdge;
}

/** An existing connection -- at 'connected' tier, tenant-directory reveals the real name and phone. */
function ConnectionCard({ edge }: ConnectionCardProps) {
  const directory = useTenantDirectoryEntry(edge.visibleTenantId);
  const displayName = directory.entry?.tenantName ?? "Aliado";

  return (
    <article
      data-testid="connection-card"
      className="flex flex-col gap-2 rounded-xl border border-border bg-white p-5 shadow-sm"
    >
      <h3 data-testid="connection-name" className="font-head text-base font-semibold text-dark">
        {displayName}
      </h3>
      {directory.contactRevealed && directory.entry?.contactPhone ? (
        <p data-testid="connection-phone" className="text-sm text-body">
          {directory.entry.contactPhone}
        </p>
      ) : null}
      {directory.reputationVisible && directory.reputation ? (
        <p data-testid="connection-reputation" className="text-sm text-muted">
          {directory.reputation.score !== null
            ? `Reputación: ${directory.reputation.score.toFixed(0)} (${directory.reputation.totalCount})`
            : "Todavía sin calificar"}
        </p>
      ) : null}
    </article>
  );
}

export function RedPage() {
  const { data: session } = useSessionClaims();
  const tenantId = session?.status === "authenticated" ? session.claims.tenantId : undefined;
  const { data: currentUserId } = useCurrentUserId();

  const { data: pendingRequests, isPending: isPendingRequestsLoading } =
    useMyPendingConnectionRequests(tenantId);
  const { data: edges, isPending: isEdgesLoading } = useMyConnectionEdges();

  return (
    <div className="min-h-screen bg-bg">
      <Topbar />
      <main className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-10">
        <div>
          <h1 className="font-head text-2xl font-bold text-dark">Tu red de aliados</h1>
          <p className="mt-1 text-sm text-body">
            Tus conexiones activas y las solicitudes que todavía tenés que responder.
          </p>
        </div>

        <section className="flex flex-col gap-4">
          <h2 className="font-head text-lg font-semibold text-dark">Solicitudes pendientes</h2>
          {isPendingRequestsLoading ? (
            <p data-testid="pending-requests-loading" className="text-sm text-muted">
              Cargando…
            </p>
          ) : pendingRequests && pendingRequests.length > 0 ? (
            <div className="flex flex-col gap-4">
              {pendingRequests.map((request) => (
                <PendingRequestCard
                  key={request.id}
                  request={request}
                  currentUserId={currentUserId}
                />
              ))}
            </div>
          ) : (
            <p data-testid="pending-requests-empty" className="text-sm text-muted">
              No tenés solicitudes pendientes.
            </p>
          )}
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="font-head text-lg font-semibold text-dark">Mis conexiones</h2>
          {isEdgesLoading ? (
            <p data-testid="connections-loading" className="text-sm text-muted">
              Cargando…
            </p>
          ) : edges && edges.length > 0 ? (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {edges.map((edge) => (
                <ConnectionCard key={edge.id} edge={edge} />
              ))}
            </div>
          ) : (
            <p data-testid="connections-empty" className="text-sm text-muted">
              Todavía no tenés conexiones activas.
            </p>
          )}
        </section>
      </main>
    </div>
  );
}
