import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithRouter } from "../test/render-with-router";

const useSessionClaims = vi.fn();
const getUser = vi.fn();
const signOut = vi.fn();

const useCreateSearchRequest = vi.fn();
const useOwnSearchRequests = vi.fn();
const useSearchMatches = vi.fn();
const useOptInFanOut = vi.fn();
const useProceedOnMatch = vi.fn();

vi.mock("@/features/identity-bridge", () => ({
  supabaseClient: {
    auth: {
      signOut: () => signOut(),
      getUser: () => getUser(),
    },
  },
  useSessionClaims: () => useSessionClaims(),
}));

vi.mock("@/features/targeted-search", () => ({
  useCreateSearchRequest: () => useCreateSearchRequest(),
  useOwnSearchRequests: (tenantId: string | undefined) => useOwnSearchRequests(tenantId),
  useSearchMatches: (input: unknown) => useSearchMatches(input),
  useOptInFanOut: () => useOptInFanOut(),
  useProceedOnMatch: () => useProceedOnMatch(),
}));

import { SolicitudesPage } from "./solicitudes";

const TENANT_ID = "a0000000-0000-4000-8000-000000000001";
const USER_ID = "b0000000-0000-4000-8000-000000000002";

const OPEN_REQUEST = {
  id: "c0000000-0000-4000-8000-000000000003",
  tenant_id: TENANT_ID,
  requested_by: USER_ID,
  criteria: { make: "Toyota", model: "Corolla", yearFrom: 2018, yearTo: 2022, maxBudget: 80000000 },
  status: "open" as const,
  opted_in_fan_out: false,
  opted_in_at: null,
  created_at: "2026-08-01T12:00:00.000Z",
  updated_at: "2026-08-01T12:00:00.000Z",
};

function authenticatedSession() {
  return {
    data: {
      status: "authenticated",
      claims: { tenantId: TENANT_ID, role: "owner", redAliadosEnabled: true },
    },
  };
}

describe("SolicitudesPage", () => {
  beforeEach(() => {
    useSessionClaims.mockReset();
    getUser.mockReset();
    signOut.mockReset();
    useCreateSearchRequest.mockReset();
    useOwnSearchRequests.mockReset();
    useSearchMatches.mockReset();
    useOptInFanOut.mockReset();
    useProceedOnMatch.mockReset();

    useSessionClaims.mockReturnValue(authenticatedSession());
    getUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null });
    useCreateSearchRequest.mockReturnValue({ mutate: vi.fn(), isPending: false });
    useSearchMatches.mockReturnValue({ matches: [], isLoading: false });
    useOptInFanOut.mockReturnValue({ mutate: vi.fn(), isPending: false });
    useProceedOnMatch.mockReturnValue({ mutate: vi.fn(), isPending: false });
  });

  it("shows a loading state while search requests are pending", async () => {
    useOwnSearchRequests.mockReturnValue({ data: undefined, isPending: true });

    await renderWithRouter(<SolicitudesPage />);

    expect(screen.getByTestId("search-requests-loading")).toBeInTheDocument();
  });

  it("shows a friendly empty state when the tenant has no search requests", async () => {
    useOwnSearchRequests.mockReturnValue({ data: [], isPending: false });

    await renderWithRouter(<SolicitudesPage />);

    expect(screen.getByTestId("search-requests-empty")).toBeInTheDocument();
    expect(screen.queryByTestId("search-request-card")).not.toBeInTheDocument();
  });

  it("renders a card per search request with its criteria summary and status", async () => {
    useOwnSearchRequests.mockReturnValue({ data: [OPEN_REQUEST], isPending: false });

    await renderWithRouter(<SolicitudesPage />);

    const cards = screen.getAllByTestId("search-request-card");
    expect(cards).toHaveLength(1);
    expect(cards[0]).toHaveTextContent("Toyota Corolla");
    expect(cards[0]).toHaveTextContent("Abierta");
    expect(cards[0]).toHaveTextContent("Solo inventario propio");
  });

  it("expands a card to show its matches, own-inventory and network", async () => {
    useOwnSearchRequests.mockReturnValue({ data: [OPEN_REQUEST], isPending: false });
    useSearchMatches.mockReturnValue({
      matches: [
        {
          id: "m1",
          source: "own_inventory",
          vehicleSnapshotId: "v1",
          make: "Toyota",
          model: "Corolla",
          year: 2020,
          matchOwnerTenantId: TENANT_ID,
        },
        {
          id: "m2",
          source: "network",
          vehicleSnapshotId: "v2",
          make: "",
          model: "",
          year: null,
          matchOwnerTenantId: "d0000000-0000-4000-8000-000000000004",
        },
      ],
      isLoading: false,
    });
    const user = userEvent.setup();

    await renderWithRouter(<SolicitudesPage />);
    await user.click(screen.getByTestId("search-request-toggle-button"));

    const items = screen.getAllByTestId("search-match-item");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("Toyota Corolla 2020");
    expect(items[1]).toHaveTextContent("Un aliado tiene un vehículo similar.");
    expect(screen.getByTestId("search-match-proceed-button")).toBeInTheDocument();
  });

  it("submits the criteria form via useCreateSearchRequest with the resolved tenant and user id", async () => {
    useOwnSearchRequests.mockReturnValue({ data: [], isPending: false });
    const mutate = vi.fn();
    useCreateSearchRequest.mockReturnValue({ mutate, isPending: false });
    const user = userEvent.setup();

    await renderWithRouter(<SolicitudesPage />);
    await user.type(screen.getByTestId("search-request-make-input"), "Mazda");
    await user.type(screen.getByTestId("search-request-model-input"), "3");

    await waitFor(() => expect(getUser).toHaveBeenCalled());
    await user.click(screen.getByTestId("search-request-submit-button"));

    await waitFor(() => expect(mutate).toHaveBeenCalledTimes(1));
    expect(mutate).toHaveBeenCalledWith(
      {
        tenantId: TENANT_ID,
        requestedBy: USER_ID,
        criteria: { make: "Mazda", model: "3" },
      },
      expect.anything(),
    );
  });
});
