import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithRouter } from "../test/render-with-router";

const useSessionClaims = vi.fn();
const getUser = vi.fn();
const signOut = vi.fn();

const useMyConnectionRequests = vi.fn();
const useConnectionMessagesThread = vi.fn();
const useSendConnectionMessage = vi.fn();

vi.mock("@/features/identity-bridge", () => ({
  supabaseClient: {
    auth: {
      signOut: () => signOut(),
      getUser: () => getUser(),
    },
  },
  useSessionClaims: () => useSessionClaims(),
}));

vi.mock("@/features/network-connections", () => ({
  useMyConnectionRequests: () => useMyConnectionRequests(),
}));

vi.mock("@/features/connection-messaging", () => ({
  useConnectionMessagesThread: (requestId: string | undefined) =>
    useConnectionMessagesThread(requestId),
  useSendConnectionMessage: () => useSendConnectionMessage(),
}));

import { MensajesPage } from "./mensajes";

const TENANT_ID = "a0000000-0000-4000-8000-000000000001";
const USER_ID = "b0000000-0000-4000-8000-000000000002";
const OTHER_TENANT_ID = "c0000000-0000-4000-8000-000000000003";
const REQUEST_ID = "d0000000-0000-4000-8000-000000000004";

function authenticatedSession() {
  return {
    data: {
      status: "authenticated",
      claims: { tenantId: TENANT_ID, role: "owner", redAliadosEnabled: true },
    },
  };
}

describe("MensajesPage", () => {
  beforeEach(() => {
    useSessionClaims.mockReset();
    getUser.mockReset();
    signOut.mockReset();
    useMyConnectionRequests.mockReset();
    useConnectionMessagesThread.mockReset();
    useSendConnectionMessage.mockReset();

    useSessionClaims.mockReturnValue(authenticatedSession());
    getUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null });
    useConnectionMessagesThread.mockReturnValue({
      isParticipant: false,
      contactRevealed: false,
      messages: [],
      isLoading: false,
    });
    useSendConnectionMessage.mockReturnValue({ mutate: vi.fn(), isPending: false });
  });

  it("shows a loading state while the thread list is pending", async () => {
    useMyConnectionRequests.mockReturnValue({ data: undefined, isPending: true });

    await renderWithRouter(<MensajesPage />);

    expect(screen.getByTestId("thread-list-loading")).toBeInTheDocument();
  });

  it("shows a friendly empty state when there are no conversations yet", async () => {
    useMyConnectionRequests.mockReturnValue({ data: [], isPending: false });

    await renderWithRouter(<MensajesPage />);

    expect(screen.getByTestId("thread-list-empty")).toBeInTheDocument();
  });

  it("renders each request as a thread row with status badge and direction, and no thread selected by default", async () => {
    useMyConnectionRequests.mockReturnValue({
      data: [
        {
          id: REQUEST_ID,
          requester_tenant_id: TENANT_ID,
          recipient_tenant_id: OTHER_TENANT_ID,
          origin_type: "vehicle_interest",
          status: "pending",
        },
      ],
      isPending: false,
    });

    await renderWithRouter(<MensajesPage />);

    const item = screen.getByTestId("thread-list-item");
    expect(item).toHaveTextContent("Aliado");
    expect(item).toHaveTextContent("Pendiente");
    expect(item).toHaveTextContent("Enviada por vos");
    expect(screen.getByTestId("thread-panel-none-selected")).toBeInTheDocument();
  });

  it("selects a thread on click and renders its message panel", async () => {
    useMyConnectionRequests.mockReturnValue({
      data: [
        {
          id: REQUEST_ID,
          requester_tenant_id: OTHER_TENANT_ID,
          recipient_tenant_id: TENANT_ID,
          origin_type: "search_match",
          status: "accepted",
        },
      ],
      isPending: false,
    });
    useConnectionMessagesThread.mockReturnValue({
      isParticipant: true,
      contactRevealed: true,
      messages: [
        {
          id: "m1",
          connection_request_id: REQUEST_ID,
          sender_tenant_id: OTHER_TENANT_ID,
          sender_user_id: "other-user",
          body: "Hola, sigue disponible?",
          created_at: "2026-08-01T12:00:00.000Z",
        },
      ],
      isLoading: false,
    });
    const user = userEvent.setup();

    await renderWithRouter(<MensajesPage />);
    await user.click(screen.getByTestId("thread-list-item"));

    expect(useConnectionMessagesThread).toHaveBeenCalledWith(REQUEST_ID);
    const bubble = screen.getByTestId("message-bubble");
    expect(bubble).toHaveTextContent("Hola, sigue disponible?");
    expect(bubble).toHaveAttribute("data-own", "false");
  });

  it("sends a message via useSendConnectionMessage with the resolved tenant and user id", async () => {
    const mutate = vi.fn();
    useSendConnectionMessage.mockReturnValue({ mutate, isPending: false });
    useMyConnectionRequests.mockReturnValue({
      data: [
        {
          id: REQUEST_ID,
          requester_tenant_id: TENANT_ID,
          recipient_tenant_id: OTHER_TENANT_ID,
          origin_type: "vehicle_interest",
          status: "accepted",
        },
      ],
      isPending: false,
    });
    useConnectionMessagesThread.mockReturnValue({
      isParticipant: true,
      contactRevealed: true,
      messages: [],
      isLoading: false,
    });
    const user = userEvent.setup();

    await renderWithRouter(<MensajesPage />);
    await user.click(screen.getByTestId("thread-list-item"));
    await waitFor(() => expect(getUser).toHaveBeenCalled());
    expect(screen.getByTestId("thread-panel-empty")).toBeInTheDocument();

    await user.type(screen.getByTestId("thread-panel-compose-input"), "Sigue disponible?");
    await user.click(screen.getByTestId("thread-panel-send-button"));

    expect(mutate).toHaveBeenCalledWith({
      connectionRequestId: REQUEST_ID,
      senderTenantId: TENANT_ID,
      senderUserId: USER_ID,
      body: "Sigue disponible?",
    });
  });
});
