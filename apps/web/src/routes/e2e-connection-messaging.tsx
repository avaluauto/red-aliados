import { createFileRoute } from "@tanstack/react-router";
import {
  MessageThread,
  useConnectionMessagesThread,
  useSendConnectionMessage,
} from "@/features/connection-messaging";

// E2E-ONLY test harness (task 8.4), never linked from real navigation. Wires
// the REAL useConnectionMessagesThread/useSendConnectionMessage hooks +
// MessageThread component together, exercising the actual query/mutation
// call shape against `supabaseClient` in a real browser -- same test-seam
// pattern PR5/PR6/PR7's harnesses established.
//
// There is no live red-aliados Supabase project yet (see
// supabase/THIRD_PARTY_AUTH.md, "Status: NOT CONFIGURED"), so
// apps/web/e2e/connection-messaging.spec.ts intercepts the underlying
// PostgREST calls via `page.route` rather than hitting a real Postgres
// instance. This proves the CLIENT wiring end-to-end (party-check ->
// messages read -> render, contact-reveal gate, and -- for the "third
// tenant" scenario -- that the client never even calls fetchConnectionMessages
// or opens a Realtime subscription once the party check comes back empty),
// not that RLS itself (select_own_connection_requests/
// select_own_thread_messages, supabase/migrations/0003_rls_policies.sql)
// denies a foreign tenant's direct query -- that remains a documented
// verification gap, same as PR3/PR6's own skipped RLS-bypass tests.
//
// contactPhone is seeded via URL param as a fixture (same pattern
// e2e-tenant-directory.tsx uses for tenantName/contactPhone) -- wiring the
// REAL tenant-directory contact query here would require mocking a second,
// unrelated endpoint (vehicle_snapshots_public) for a value this feature
// intentionally does not fetch itself (see MessageThread's own header
// comment: connection-messaging owns WHEN to reveal, not WHAT to reveal).
export const Route = createFileRoute("/e2e-connection-messaging")({
  component: ConnectionMessagingHarnessRoute,
});

function ConnectionMessagingHarnessRoute() {
  if (import.meta.env.MODE !== "e2e") {
    return null;
  }

  return <ConnectionMessagingHarness />;
}

function ConnectionMessagingHarness() {
  const params = new URLSearchParams(window.location.search);
  const requestId = params.get("requestId") ?? undefined;
  const currentTenantId = params.get("currentTenantId") ?? "";
  const currentUserId = params.get("currentUserId") ?? "";
  const contactPhone = params.get("contactPhone") ?? null;

  const thread = useConnectionMessagesThread(requestId);
  const send = useSendConnectionMessage();

  if (thread.isLoading) {
    return (
      <main>
        <p data-testid="message-thread-loading">loading</p>
      </main>
    );
  }

  if (!thread.isParticipant) {
    return (
      <main>
        <p data-testid="message-thread-no-access">no access to this thread</p>
      </main>
    );
  }

  return (
    <main>
      <MessageThread
        messages={thread.messages}
        currentTenantId={currentTenantId}
        contactRevealed={thread.contactRevealed}
        contactPhone={contactPhone}
        isSending={send.isPending}
        onSend={(body) =>
          send.mutate({
            connectionRequestId: requestId as string,
            senderTenantId: currentTenantId,
            senderUserId: currentUserId,
            body,
          })
        }
      />
    </main>
  );
}
