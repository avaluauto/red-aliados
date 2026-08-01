import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MessageThread } from "./MessageThread";

const CURRENT_TENANT = "11111111-1111-4111-8111-111111111111";
const OTHER_TENANT = "22222222-2222-4222-8222-222222222222";

const MESSAGES = [
  {
    id: "m1",
    connection_request_id: "r1",
    sender_tenant_id: CURRENT_TENANT,
    sender_user_id: "u1",
    body: "hello there",
    created_at: "2026-08-01T12:00:00.000Z",
  },
  {
    id: "m2",
    connection_request_id: "r1",
    sender_tenant_id: OTHER_TENANT,
    sender_user_id: "u2",
    body: "hi, thanks for reaching out",
    created_at: "2026-08-01T12:01:00.000Z",
  },
];

describe("MessageThread", () => {
  it("renders every message in order with own/counterpart marked", () => {
    render(
      <MessageThread
        messages={MESSAGES}
        currentTenantId={CURRENT_TENANT}
        contactRevealed={false}
        contactPhone={null}
        onSend={vi.fn()}
      />,
    );

    const items = screen.getAllByTestId("message-thread-message");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("hello there");
    expect(items[0]).toHaveAttribute("data-own", "true");
    expect(items[1]).toHaveTextContent("hi, thanks for reaching out");
    expect(items[1]).toHaveAttribute("data-own", "false");
  });

  it("masks the counterpart's contact while not revealed", () => {
    render(
      <MessageThread
        messages={[]}
        currentTenantId={CURRENT_TENANT}
        contactRevealed={false}
        contactPhone="+52 55 1234 5678"
        onSend={vi.fn()}
      />,
    );

    expect(screen.getByTestId("message-thread-contact-masked")).toBeInTheDocument();
    expect(screen.queryByTestId("message-thread-contact")).not.toBeInTheDocument();
    expect(screen.queryByText("+52 55 1234 5678")).not.toBeInTheDocument();
  });

  it("reveals the counterpart's contact once contactRevealed is true", () => {
    render(
      <MessageThread
        messages={[]}
        currentTenantId={CURRENT_TENANT}
        contactRevealed={true}
        contactPhone="+52 55 1234 5678"
        onSend={vi.fn()}
      />,
    );

    expect(screen.getByTestId("message-thread-contact")).toHaveTextContent("+52 55 1234 5678");
    expect(screen.queryByTestId("message-thread-contact-masked")).not.toBeInTheDocument();
  });

  it("sends the composed body and clears the input", async () => {
    const onSend = vi.fn();
    const user = userEvent.setup();

    render(
      <MessageThread
        messages={[]}
        currentTenantId={CURRENT_TENANT}
        contactRevealed={false}
        contactPhone={null}
        onSend={onSend}
      />,
    );

    const input = screen.getByTestId("message-thread-compose-input");
    await user.type(input, "let's talk");
    await user.click(screen.getByTestId("message-thread-send-button"));

    expect(onSend).toHaveBeenCalledWith("let's talk");
    expect(input).toHaveValue("");
  });

  it("does not send an empty/whitespace-only message", async () => {
    const onSend = vi.fn();
    const user = userEvent.setup();

    render(
      <MessageThread
        messages={[]}
        currentTenantId={CURRENT_TENANT}
        contactRevealed={false}
        contactPhone={null}
        onSend={onSend}
      />,
    );

    await user.type(screen.getByTestId("message-thread-compose-input"), "   ");
    expect(screen.getByTestId("message-thread-send-button")).toBeDisabled();
    expect(onSend).not.toHaveBeenCalled();
  });

  it("disables composing while a send is in flight", () => {
    render(
      <MessageThread
        messages={[]}
        currentTenantId={CURRENT_TENANT}
        contactRevealed={false}
        contactPhone={null}
        isSending
        onSend={vi.fn()}
      />,
    );

    expect(screen.getByTestId("message-thread-compose-input")).toBeDisabled();
    expect(screen.getByTestId("message-thread-send-button")).toBeDisabled();
  });

  it("renders no attachment, presence, or read-receipt controls -- Scope Cap", () => {
    render(
      <MessageThread
        messages={MESSAGES}
        currentTenantId={CURRENT_TENANT}
        contactRevealed={true}
        contactPhone="+52 55 1234 5678"
        onSend={vi.fn()}
      />,
    );

    expect(screen.queryByTestId(/attachment/i)).not.toBeInTheDocument();
    expect(screen.queryByTestId(/presence/i)).not.toBeInTheDocument();
    expect(screen.queryByTestId(/read-receipt/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/attach/i)).not.toBeInTheDocument();
  });
});
