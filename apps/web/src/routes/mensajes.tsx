import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import {
  type ConnectionMessageRow,
  useConnectionMessagesThread,
  useSendConnectionMessage,
} from "@/features/connection-messaging";
import { supabaseClient, useSessionClaims } from "@/features/identity-bridge";
import { type ConnectionRequestRow, useMyConnectionRequests } from "@/features/network-connections";
import { Topbar } from "@/shared/ui/Topbar";

// "Mensajes" -- every connection_request the caller's tenant has ever been
// part of (any status, either direction), each opening onto its own message
// thread. Deliberately reuses no tenant-name resolver here: unlike
// routes/red.tsx's cards (which only ever render an accepted-tier or
// candidate-tier tenant-directory entry), a thread exists "from the
// request's creation, pre-acceptance" per connection-messaging's own spec,
// so most rows here have no directory visibility at all -- the list falls
// back to a plain "Aliado" placeholder plus origin/direction/status, never a
// fabricated name. Only composes the already-tested data/hooks layer
// (features/network-connections, features/connection-messaging) -- no
// query/mutation logic lives here, same convention routes/red.tsx and
// routes/solicitudes.tsx established.
export const Route = createFileRoute("/mensajes")({
  component: MensajesPage,
});

const STATUS_LABEL: Record<ConnectionRequestRow["status"], string> = {
  suggested: "Sugerida",
  pending: "Pendiente",
  accepted: "Aceptada",
  rejected: "Rechazada",
  expired: "Expirada",
};

const STATUS_TONE: Record<ConnectionRequestRow["status"], string> = {
  suggested: "bg-tint text-primary",
  pending: "bg-tint text-primary",
  accepted: "bg-success/10 text-success",
  rejected: "bg-border-2 text-muted",
  expired: "bg-border-2 text-muted",
};

const ORIGIN_LABEL: Record<ConnectionRequestRow["origin_type"], string> = {
  vehicle_interest: "Interés en vehículo",
  search_match: "Coincidencia de búsqueda",
  direct: "Directo",
};

/**
 * SessionClaims (identity-bridge/domain/session-claims.ts) carries
 * tenantId/role/redAliadosEnabled but no user id -- sending a message needs
 * one for `senderUserId`. Reads it straight from Supabase's own auth user,
 * same pattern routes/red.tsx and routes/solicitudes.tsx already established
 * for this exact gap.
 */
function useCurrentUserId() {
  return useQuery({
    queryKey: ["mensajes", "current-user-id"],
    queryFn: async () => {
      const { data, error } = await supabaseClient.auth.getUser();
      if (error || !data.user) {
        return null;
      }
      return data.user.id;
    },
  });
}

interface ThreadListItemProps {
  readonly request: ConnectionRequestRow;
  readonly tenantId: string | undefined;
  readonly selected: boolean;
  readonly onSelect: () => void;
}

function ThreadListItem({ request, tenantId, selected, onSelect }: ThreadListItemProps) {
  const isOutbound = request.requester_tenant_id === tenantId;

  return (
    <li>
      <button
        type="button"
        data-testid="thread-list-item"
        data-selected={selected}
        onClick={onSelect}
        className={`flex w-full flex-col gap-1.5 rounded-xl border p-4 text-left transition-colors ${
          selected ? "border-primary bg-tint" : "border-border bg-white hover:border-border-2"
        }`}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="font-head text-sm font-semibold text-dark">Aliado</span>
          <span
            data-testid="thread-list-item-status"
            className={`w-fit rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide ${STATUS_TONE[request.status]}`}
          >
            {STATUS_LABEL[request.status]}
          </span>
        </div>
        <span className="text-xs text-muted">
          {isOutbound ? "Enviada por vos" : "Recibida"} · {ORIGIN_LABEL[request.origin_type]}
        </span>
      </button>
    </li>
  );
}

interface MessageBubbleProps {
  readonly message: ConnectionMessageRow;
  readonly own: boolean;
}

function MessageBubble({ message, own }: MessageBubbleProps) {
  return (
    <li
      data-testid="message-bubble"
      data-own={own}
      className={`flex ${own ? "justify-end" : "justify-start"}`}
    >
      <p
        className={`max-w-[80%] rounded-xl px-3.5 py-2 text-sm ${
          own ? "bg-primary text-white" : "bg-tint text-dark"
        }`}
      >
        {message.body}
      </p>
    </li>
  );
}

interface ThreadPanelProps {
  readonly requestId: string;
  readonly tenantId: string | undefined;
  readonly currentUserId: string | null | undefined;
}

function ThreadPanel({ requestId, tenantId, currentUserId }: ThreadPanelProps) {
  const thread = useConnectionMessagesThread(requestId);
  const sendMessage = useSendConnectionMessage();
  const [draft, setDraft] = useState("");
  const trimmed = draft.trim();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!trimmed || !tenantId || !currentUserId) {
      return;
    }
    sendMessage.mutate({
      connectionRequestId: requestId,
      senderTenantId: tenantId,
      senderUserId: currentUserId,
      body: trimmed,
    });
    setDraft("");
  }

  if (thread.isLoading) {
    return (
      <p data-testid="thread-panel-loading" className="text-sm text-muted">
        Cargando…
      </p>
    );
  }

  if (!thread.isParticipant) {
    return (
      <p data-testid="thread-panel-no-access" className="text-sm text-muted">
        No podés ver esta conversación.
      </p>
    );
  }

  return (
    <div className="flex h-full flex-col gap-4">
      {thread.messages.length > 0 ? (
        <ul
          data-testid="thread-panel-messages"
          className="flex flex-1 flex-col gap-2 overflow-y-auto"
        >
          {thread.messages.map((message) => (
            <MessageBubble
              key={message.id}
              message={message}
              own={message.sender_tenant_id === tenantId}
            />
          ))}
        </ul>
      ) : (
        <p data-testid="thread-panel-empty" className="flex-1 text-sm text-muted">
          Todavía no hay mensajes en esta conversación.
        </p>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-2 sm:flex-row">
        <label className="sr-only" htmlFor="mensajes-compose">
          Mensaje
        </label>
        <textarea
          id="mensajes-compose"
          data-testid="thread-panel-compose-input"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          disabled={sendMessage.isPending || !currentUserId}
          rows={2}
          placeholder="Escribí un mensaje…"
          className="flex-1 resize-none rounded-lg border border-border-2 bg-white px-3 py-2 text-sm text-dark placeholder:text-faint focus:border-primary focus:outline-none"
        />
        <button
          type="submit"
          data-testid="thread-panel-send-button"
          disabled={sendMessage.isPending || !currentUserId || trimmed.length === 0}
          className="rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:opacity-90 disabled:opacity-50"
        >
          Enviar
        </button>
      </form>
    </div>
  );
}

export function MensajesPage() {
  const { data: session } = useSessionClaims();
  const tenantId = session?.status === "authenticated" ? session.claims.tenantId : undefined;
  const { data: currentUserId } = useCurrentUserId();

  const { data: requests, isPending: isRequestsLoading } = useMyConnectionRequests();
  const [selectedRequestId, setSelectedRequestId] = useState<string | undefined>(undefined);

  return (
    <div className="min-h-screen bg-bg">
      <Topbar />
      <main className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-10">
        <div>
          <h1 className="font-head text-2xl font-bold text-dark">Mensajes</h1>
          <p className="mt-1 text-sm text-body">
            Tus conversaciones con otros aliados, desde que se crea la solicitud.
          </p>
        </div>

        <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[320px_1fr] lg:items-start">
          <section
            aria-label="Conversaciones"
            className="flex flex-col gap-3 rounded-xl border border-border bg-white p-4 shadow-sm"
          >
            {isRequestsLoading ? (
              <p data-testid="thread-list-loading" className="text-sm text-muted">
                Cargando…
              </p>
            ) : requests && requests.length > 0 ? (
              <ul data-testid="thread-list" className="flex flex-col gap-2">
                {requests.map((request) => (
                  <ThreadListItem
                    key={request.id}
                    request={request}
                    tenantId={tenantId}
                    selected={request.id === selectedRequestId}
                    onSelect={() => setSelectedRequestId(request.id)}
                  />
                ))}
              </ul>
            ) : (
              <p data-testid="thread-list-empty" className="text-sm text-muted">
                Todavía no tenés conversaciones.
              </p>
            )}
          </section>

          <section
            aria-label="Conversación seleccionada"
            className="flex min-h-[320px] flex-col rounded-xl border border-border bg-white p-5 shadow-sm lg:min-h-[480px]"
          >
            {selectedRequestId ? (
              <ThreadPanel
                requestId={selectedRequestId}
                tenantId={tenantId}
                currentUserId={currentUserId}
              />
            ) : (
              <p data-testid="thread-panel-none-selected" className="text-sm text-muted">
                Elegí una conversación para ver los mensajes.
              </p>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
