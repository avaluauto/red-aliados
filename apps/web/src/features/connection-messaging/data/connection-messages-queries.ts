// Data adapter for connection-messaging (spec: Origin-Scoped Thread, Contact
// Reveal Only on Acceptance). Reuses the single Supabase client instance
// from identity-bridge (same convention every other feature's data/ adapter
// follows) -- domain/ stays pure, this is the only layer here allowed to
// talk to Supabase, per design.md's hexagonal-lite split.
//
// Convention split vs. network-connections' own adapter: READ functions
// (fetchConnectionRequestParty, fetchConnectionMessages) swallow errors to
// null/an empty array, exactly like every other fetch* function in this
// codebase -- a failed read degrades to "nothing visible yet", never a
// crash. sendConnectionMessage THROWS on error instead, because a TanStack
// `useMutation` needs a real error to react to.
import type { Tables } from "@red-aliados/contracts/db";
import { supabaseClient } from "@/features/identity-bridge";
import type { ConnectionRequestStatus } from "@/features/network-connections";

export type ConnectionMessageRow = Tables<"connection_messages">;

export interface ConnectionRequestParty {
  readonly id: string;
  readonly requesterTenantId: string;
  readonly recipientTenantId: string;
  readonly status: ConnectionRequestStatus;
}

/**
 * Reads the bare minimum of the originating connection_requests row needed
 * to (a) confirm the caller's own tenant is actually a party to it --
 * `select_own_connection_requests` (0003_rls_policies.sql) already restricts
 * visible rows to the requester/recipient tenant, so a non-null result here
 * IS the proof -- and (b) drive the contact-reveal gate
 * (../domain/contact-reveal.ts) off the request's own status.
 *
 * This is the ONLY thing `useConnectionMessagesThread` checks before it ever
 * calls `fetchConnectionMessages` or opens a Realtime subscription (task
 * 8.2: "the client only ever subscribes to requests it's actually part
 * of"). RLS remains the real enforcement point -- this is the client-side
 * guard that avoids even attempting the read/subscription for a request the
 * caller was never part of.
 */
export async function fetchConnectionRequestParty(
  requestId: string,
): Promise<ConnectionRequestParty | null> {
  const { data, error } = await supabaseClient
    .from("connection_requests")
    .select("id, requester_tenant_id, recipient_tenant_id, status")
    .eq("id", requestId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return {
    id: data.id,
    requesterTenantId: data.requester_tenant_id,
    recipientTenantId: data.recipient_tenant_id,
    status: data.status as ConnectionRequestStatus,
  };
}

/**
 * Reads the thread's messages, oldest first. `select_own_thread_messages`
 * (0003) already scopes rows to the two tenants party to the originating
 * request.
 */
export async function fetchConnectionMessages(requestId: string): Promise<ConnectionMessageRow[]> {
  const { data, error } = await supabaseClient
    .from("connection_messages")
    .select()
    .eq("connection_request_id", requestId)
    .order("created_at", { ascending: true });

  if (error || !data) {
    return [];
  }
  return data;
}

export interface SendConnectionMessageInput {
  readonly connectionRequestId: string;
  readonly senderTenantId: string;
  readonly senderUserId: string;
  readonly body: string;
}

/** Sends a message. `insert_own_thread_message` (0003) enforces the sender is a party. */
export async function sendConnectionMessage(
  input: SendConnectionMessageInput,
): Promise<ConnectionMessageRow> {
  const { data, error } = await supabaseClient
    .from("connection_messages")
    .insert({
      connection_request_id: input.connectionRequestId,
      sender_tenant_id: input.senderTenantId,
      sender_user_id: input.senderUserId,
      body: input.body,
    })
    .select()
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "failed to send message");
  }
  return data;
}

/**
 * Reads the most recent `limit` connection_messages sent BY OTHER tenants
 * across every thread the caller's own tenant is a party to --
 * routes/index.tsx's "Actividad reciente" feed. This is a deliberately
 * small stand-in for a proper per-tenant "unread messages" feature, which
 * does not exist yet: there is no read-receipt/unread tracking anywhere in
 * this schema (connection_messages' own table comment: "No attachments/
 * presence/read-receipts", connection-messaging spec's Scope Cap). Instead
 * of fabricating an "unread count", this reads real recent rows.
 * `select_own_thread_messages` (0003_rls_policies.sql) already scopes
 * visible rows to threads the caller's tenant is requester/recipient of --
 * the `.neq` here only excludes the caller's OWN outgoing messages, so the
 * feed reads as "things aliados sent you", not an echo of your own sent
 * messages. Read path: swallows errors to an empty array, same convention
 * as every other fetch* in this file.
 */
export async function fetchRecentIncomingMessages(
  tenantId: string,
  limit: number,
): Promise<ConnectionMessageRow[]> {
  const { data, error } = await supabaseClient
    .from("connection_messages")
    .select()
    .neq("sender_tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error || !data) {
    return [];
  }
  return data;
}

export type ConnectionMessageInsertHandler = (message: ConnectionMessageRow) => void;

/**
 * Subscribes to Realtime INSERT events on `connection_messages` for a single
 * `connection_request_id` (connection-messaging: Origin-Scoped Thread).
 * Server-side, Supabase Realtime's `postgres_changes` replication still runs
 * through RLS for the subscribing role (`select_own_thread_messages`, 0003)
 * -- a tenant that is not a party to `requestId` receives no events even if
 * it somehow subscribed. The CLIENT-side guard is
 * `useConnectionMessagesThread` only ever calling this once
 * `fetchConnectionRequestParty` has confirmed party-ship (task 8.2) -- this
 * function itself does not re-check that, by design (same "data/ trusts
 * hooks/ to gate it" split as every other data/ adapter here).
 */
export function subscribeToConnectionMessages(
  requestId: string,
  onInsert: ConnectionMessageInsertHandler,
): () => void {
  const channel = supabaseClient
    .channel(`connection_messages:${requestId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "connection_messages",
        filter: `connection_request_id=eq.${requestId}`,
      },
      (payload: { new: unknown }) => onInsert(payload.new as ConnectionMessageRow),
    )
    .subscribe();

  return () => {
    supabaseClient.removeChannel(channel);
  };
}
