import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithRouter } from "../test/render-with-router";

const useSessionClaims = vi.fn();
const getUser = vi.fn();
const signOut = vi.fn();

const useMyConnectionEdges = vi.fn();
const useMyPendingConnectionRequests = vi.fn();
const useActOnSuggestedRequest = vi.fn();
const useAcceptConnectionRequest = vi.fn();
const useRejectConnectionRequest = vi.fn();

const useTenantDirectoryEntry = vi.fn();

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
  useMyConnectionEdges: () => useMyConnectionEdges(),
  useMyPendingConnectionRequests: (tenantId: string | undefined) =>
    useMyPendingConnectionRequests(tenantId),
  useActOnSuggestedRequest: () => useActOnSuggestedRequest(),
  useAcceptConnectionRequest: () => useAcceptConnectionRequest(),
  useRejectConnectionRequest: () => useRejectConnectionRequest(),
}));

vi.mock("@/features/tenant-directory", () => ({
  useTenantDirectoryEntry: (tenantId: string | undefined) => useTenantDirectoryEntry(tenantId),
}));

import { RedPage } from "./red";

const TENANT_ID = "a0000000-0000-4000-8000-000000000001";
const USER_ID = "b0000000-0000-4000-8000-000000000002";
const OTHER_TENANT_ID = "c0000000-0000-4000-8000-000000000003";

function authenticatedSession() {
  return {
    data: {
      status: "authenticated",
      claims: { tenantId: TENANT_ID, role: "owner", redAliadosEnabled: true },
    },
  };
}

const CANDIDATE_DIRECTORY_RESULT = {
  tier: "candidate" as const,
  contactRevealed: false,
  reputationVisible: true,
  entry: { tenantId: OTHER_TENANT_ID, tenantName: null, contactPhone: null, tier: "candidate" },
  reputation: { acceptedCount: 1, rejectedCount: 0, expiredCount: 0, totalCount: 1, score: 90 },
  isLoading: false,
};

const CONNECTED_DIRECTORY_RESULT = {
  tier: "connected" as const,
  contactRevealed: true,
  reputationVisible: true,
  entry: {
    tenantId: OTHER_TENANT_ID,
    tenantName: "Motos del Sur",
    contactPhone: "+57 300 1234567",
    tier: "connected",
  },
  reputation: { acceptedCount: 3, rejectedCount: 0, expiredCount: 0, totalCount: 3, score: 100 },
  isLoading: false,
};

describe("RedPage", () => {
  beforeEach(() => {
    useSessionClaims.mockReset();
    getUser.mockReset();
    signOut.mockReset();
    useMyConnectionEdges.mockReset();
    useMyPendingConnectionRequests.mockReset();
    useActOnSuggestedRequest.mockReset();
    useAcceptConnectionRequest.mockReset();
    useRejectConnectionRequest.mockReset();
    useTenantDirectoryEntry.mockReset();

    useSessionClaims.mockReturnValue(authenticatedSession());
    getUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null });
    useActOnSuggestedRequest.mockReturnValue({ mutate: vi.fn(), isPending: false });
    useAcceptConnectionRequest.mockReturnValue({ mutate: vi.fn(), isPending: false });
    useRejectConnectionRequest.mockReturnValue({ mutate: vi.fn(), isPending: false });
    useTenantDirectoryEntry.mockReturnValue(CANDIDATE_DIRECTORY_RESULT);
  });

  it("shows loading states while pending requests and connections are pending", async () => {
    useMyPendingConnectionRequests.mockReturnValue({ data: undefined, isPending: true });
    useMyConnectionEdges.mockReturnValue({ data: undefined, isPending: true });

    await renderWithRouter(<RedPage />);

    expect(screen.getByTestId("pending-requests-loading")).toBeInTheDocument();
    expect(screen.getByTestId("connections-loading")).toBeInTheDocument();
  });

  it("shows friendly empty states when there are no pending requests or connections", async () => {
    useMyPendingConnectionRequests.mockReturnValue({ data: [], isPending: false });
    useMyConnectionEdges.mockReturnValue({ data: [], isPending: false });

    await renderWithRouter(<RedPage />);

    expect(screen.getByTestId("pending-requests-empty")).toBeInTheDocument();
    expect(screen.getByTestId("connections-empty")).toBeInTheDocument();
  });

  it("renders a suggested request with only tier-allowed info and an 'Aceptar conexión' action", async () => {
    useMyPendingConnectionRequests.mockReturnValue({
      data: [
        {
          id: "req-1",
          requester_tenant_id: OTHER_TENANT_ID,
          recipient_tenant_id: TENANT_ID,
          status: "suggested",
        },
      ],
      isPending: false,
    });
    useMyConnectionEdges.mockReturnValue({ data: [], isPending: false });

    await renderWithRouter(<RedPage />);

    const card = screen.getByTestId("pending-request-card");
    expect(card).toHaveTextContent("Aliado");
    expect(card).toHaveTextContent("Sugerida");
    expect(screen.getByTestId("pending-request-engage-button")).toBeInTheDocument();
    expect(screen.queryByTestId("pending-request-accept-button")).not.toBeInTheDocument();
  });

  it("acts on a suggestion via useActOnSuggestedRequest when its button is clicked", async () => {
    const mutate = vi.fn();
    useActOnSuggestedRequest.mockReturnValue({ mutate, isPending: false });
    useMyPendingConnectionRequests.mockReturnValue({
      data: [
        {
          id: "req-1",
          requester_tenant_id: OTHER_TENANT_ID,
          recipient_tenant_id: TENANT_ID,
          status: "suggested",
        },
      ],
      isPending: false,
    });
    useMyConnectionEdges.mockReturnValue({ data: [], isPending: false });
    const user = userEvent.setup();

    await renderWithRouter(<RedPage />);
    await user.click(screen.getByTestId("pending-request-engage-button"));

    expect(mutate).toHaveBeenCalledWith("req-1");
  });

  it("accepts and rejects a pending request via useAcceptConnectionRequest/useRejectConnectionRequest with the resolved user id", async () => {
    const acceptMutate = vi.fn();
    const rejectMutate = vi.fn();
    useAcceptConnectionRequest.mockReturnValue({ mutate: acceptMutate, isPending: false });
    useRejectConnectionRequest.mockReturnValue({ mutate: rejectMutate, isPending: false });
    useMyPendingConnectionRequests.mockReturnValue({
      data: [
        {
          id: "req-2",
          requester_tenant_id: OTHER_TENANT_ID,
          recipient_tenant_id: TENANT_ID,
          status: "pending",
        },
      ],
      isPending: false,
    });
    useMyConnectionEdges.mockReturnValue({ data: [], isPending: false });
    const user = userEvent.setup();

    await renderWithRouter(<RedPage />);
    await waitFor(() => expect(getUser).toHaveBeenCalled());
    await user.click(screen.getByTestId("pending-request-accept-button"));
    await user.click(screen.getByTestId("pending-request-reject-button"));

    expect(acceptMutate).toHaveBeenCalledWith({ requestId: "req-2", respondedBy: USER_ID });
    expect(rejectMutate).toHaveBeenCalledWith({ requestId: "req-2", respondedBy: USER_ID });
  });

  it("renders a connection card with the connected-tier name and phone", async () => {
    useTenantDirectoryEntry.mockReturnValue(CONNECTED_DIRECTORY_RESULT);
    useMyPendingConnectionRequests.mockReturnValue({ data: [], isPending: false });
    useMyConnectionEdges.mockReturnValue({
      data: [{ id: "edge-1", visibleTenantId: OTHER_TENANT_ID, connectionRequestId: "req-3" }],
      isPending: false,
    });

    await renderWithRouter(<RedPage />);

    const card = screen.getByTestId("connection-card");
    expect(card).toHaveTextContent("Motos del Sur");
    expect(card).toHaveTextContent("+57 300 1234567");
  });
});
