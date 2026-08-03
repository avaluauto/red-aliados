// Presentational (spec: Origin-Scoped Thread, Contact Reveal Only on
// Acceptance, Scope Cap). Deliberately renders NO attachment upload,
// presence indicator, or read-receipt control -- connection-messaging's own
// Scope Cap requirement: "MUST NOT implement attachments, presence
// indicators, or read receipts in this MVP." Never talks to ../data or
// ../hooks directly -- same "pure render" rule every other presentational
// component in this codebase follows (CandidateCard/ConnectionRequestCard/
// RequestConnectionButton).
import { type FormEvent, useState } from "react";
import type { ConnectionMessageRow } from "../data/connection-messages-queries";

export interface MessageThreadProps {
  readonly messages: readonly ConnectionMessageRow[];
  readonly currentTenantId: string;
  /** Domain-gated (../domain/contact-reveal.ts) -- true only once the originating request is 'accepted'. */
  readonly contactRevealed: boolean;
  readonly contactPhone: string | null;
  readonly isSending?: boolean;
  readonly onSend: (body: string) => void;
}

export function MessageThread({
  messages,
  currentTenantId,
  contactRevealed,
  contactPhone,
  isSending = false,
  onSend,
}: MessageThreadProps) {
  const [draft, setDraft] = useState("");
  const trimmed = draft.trim();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!trimmed) {
      return;
    }
    onSend(trimmed);
    setDraft("");
  }

  return (
    <section data-testid="message-thread" className="flex flex-col gap-3">
      {contactRevealed && contactPhone ? (
        <p data-testid="message-thread-contact" className="text-sm font-medium">
          {contactPhone}
        </p>
      ) : (
        <p data-testid="message-thread-contact-masked" className="text-sm text-slate-500 italic">
          Contact hidden until the connection is accepted
        </p>
      )}

      <ul data-testid="message-thread-messages" className="flex flex-col gap-2">
        {messages.map((message) => (
          <li
            key={message.id}
            data-testid="message-thread-message"
            data-own={message.sender_tenant_id === currentTenantId}
            className="rounded border border-slate-200 p-2 text-sm"
          >
            {message.body}
          </li>
        ))}
      </ul>

      <form onSubmit={handleSubmit} className="flex gap-2">
        <label className="sr-only" htmlFor="message-thread-compose-input">
          Message
        </label>
        <input
          id="message-thread-compose-input"
          data-testid="message-thread-compose-input"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          disabled={isSending}
          className="flex-1 rounded border border-slate-300 px-2 py-1 text-sm"
        />
        <button
          type="submit"
          data-testid="message-thread-send-button"
          disabled={isSending || trimmed.length === 0}
          className="rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </section>
  );
}
