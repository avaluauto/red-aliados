import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithRouter } from "../test/render-with-router";

const useSessionClaims = vi.fn();
const getUser = vi.fn();
const signOut = vi.fn();
const useVisibleVehicles = vi.fn();
const useCreateConnectionRequest = vi.fn();

vi.mock("@/features/identity-bridge", () => ({
  supabaseClient: {
    auth: {
      signOut: () => signOut(),
      getUser: () => getUser(),
    },
  },
  useSessionClaims: () => useSessionClaims(),
}));

vi.mock("@/features/vehicle-sync", () => ({
  useVisibleVehicles: () => useVisibleVehicles(),
}));

vi.mock("@/features/network-connections", () => ({
  useCreateConnectionRequest: () => useCreateConnectionRequest(),
}));

import { CatalogoPage } from "./catalogo";

const TENANT_ID = "a0000000-0000-4000-8000-000000000001";
const USER_ID = "b0000000-0000-4000-8000-000000000002";
const OTHER_TENANT_ID = "c0000000-0000-4000-8000-000000000003";

function authenticatedSession() {
  return {
    data: {
      status: "authenticated",
      claims: { tenantId: TENANT_ID, role: "dealer_admin", redAliadosEnabled: true },
    },
  };
}

const OWN_VEHICLE = {
  id: "v1",
  tenantId: TENANT_ID,
  make: "Toyota",
  model: "Corolla",
  year: 2020,
  allyPrice: 80_000_000,
  minPrice: 75_000_000,
  status: "available",
  viewsCount: 12,
  visibilityTier: "owner" as const,
  tenantName: "Concesionaria Test Norte",
  contactPhone: null,
};

const PEER_VEHICLE = {
  id: "v2",
  tenantId: OTHER_TENANT_ID,
  make: "Mazda",
  model: "CX-5",
  year: 2022,
  allyPrice: 120_000_000,
  minPrice: null,
  status: "available",
  viewsCount: 4,
  visibilityTier: "connected" as const,
  tenantName: "Motos del Sur",
  contactPhone: "+57 300 1234567",
};

describe("CatalogoPage", () => {
  beforeEach(() => {
    useSessionClaims.mockReset();
    getUser.mockReset();
    signOut.mockReset();
    useVisibleVehicles.mockReset();
    useCreateConnectionRequest.mockReset();

    useSessionClaims.mockReturnValue(authenticatedSession());
    getUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null });
    useCreateConnectionRequest.mockReturnValue({ mutate: vi.fn(), isPending: false });
  });

  it("shows a loading state while vehicles are pending", async () => {
    useVisibleVehicles.mockReturnValue({ data: undefined, isPending: true });

    await renderWithRouter(<CatalogoPage />);

    expect(screen.getByTestId("catalog-loading")).toBeInTheDocument();
  });

  it("shows an honest empty state when there are no visible vehicles at all", async () => {
    useVisibleVehicles.mockReturnValue({ data: [], isPending: false });

    await renderWithRouter(<CatalogoPage />);

    expect(screen.getByTestId("catalog-empty")).toHaveTextContent(
      "No hay vehículos visibles todavía.",
    );
  });

  it("renders a card per visible vehicle from real fetched data", async () => {
    useVisibleVehicles.mockReturnValue({ data: [OWN_VEHICLE, PEER_VEHICLE], isPending: false });

    await renderWithRouter(<CatalogoPage />);

    const cards = screen.getAllByTestId("catalog-vehicle-card");
    expect(cards).toHaveLength(2);
    expect(cards[0]).toHaveTextContent("Toyota Corolla");
    expect(cards[0]).toHaveTextContent("Precio mínimo");
    expect(cards[1]).toHaveTextContent("Mazda CX-5");
    expect(cards[1]).toHaveTextContent("Motos del Sur");
    expect(screen.getByTestId("catalog-result-count")).toHaveTextContent("2 vehículos visibles");
  });

  it("narrows the list with the search box (make/model substring match)", async () => {
    useVisibleVehicles.mockReturnValue({ data: [OWN_VEHICLE, PEER_VEHICLE], isPending: false });
    const user = userEvent.setup();

    await renderWithRouter(<CatalogoPage />);
    await user.type(screen.getByTestId("catalog-search-input"), "mazda");

    expect(screen.getAllByTestId("catalog-vehicle-card")).toHaveLength(1);
    expect(screen.getByTestId("catalog-result-count")).toHaveTextContent("1 vehículo visible");
    expect(screen.queryByText("Toyota Corolla")).not.toBeInTheDocument();
  });

  it("narrows the list with the make filter", async () => {
    useVisibleVehicles.mockReturnValue({ data: [OWN_VEHICLE, PEER_VEHICLE], isPending: false });
    const user = userEvent.setup();

    await renderWithRouter(<CatalogoPage />);
    await user.selectOptions(screen.getByTestId("catalog-make-select"), "Mazda");

    expect(screen.getAllByTestId("catalog-vehicle-card")).toHaveLength(1);
    expect(screen.getByText("Mazda CX-5")).toBeInTheDocument();
  });

  it("shows an honest empty state when filters match nothing", async () => {
    useVisibleVehicles.mockReturnValue({ data: [OWN_VEHICLE, PEER_VEHICLE], isPending: false });
    const user = userEvent.setup();

    await renderWithRouter(<CatalogoPage />);
    await user.type(screen.getByTestId("catalog-search-input"), "nissan");

    expect(screen.getByTestId("catalog-filtered-empty")).toHaveTextContent(
      "No hay resultados para estos filtros.",
    );
  });

  it("hides 'Me interesa' for the caller's own vehicle", async () => {
    useVisibleVehicles.mockReturnValue({ data: [OWN_VEHICLE], isPending: false });

    await renderWithRouter(<CatalogoPage />);

    expect(screen.queryByTestId("catalog-interest-button")).not.toBeInTheDocument();
  });

  it("shows 'Me interesa' for someone else's vehicle and calls the mutation with the right args", async () => {
    const mutate = vi.fn();
    useCreateConnectionRequest.mockReturnValue({ mutate, isPending: false });
    useVisibleVehicles.mockReturnValue({ data: [PEER_VEHICLE], isPending: false });
    const user = userEvent.setup();

    await renderWithRouter(<CatalogoPage />);
    await waitFor(() => expect(getUser).toHaveBeenCalled());
    await user.click(screen.getByTestId("catalog-interest-button"));

    expect(mutate).toHaveBeenCalledWith(
      {
        requesterTenantId: TENANT_ID,
        recipientTenantId: OTHER_TENANT_ID,
        originType: "vehicle_interest",
        requestedBy: USER_ID,
        vehicleSnapshotId: PEER_VEHICLE.id,
      },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });

  it("shows a sent confirmation after 'Me interesa' succeeds", async () => {
    const mutate = vi.fn((_input, options?: { onSuccess?: () => void }) => {
      options?.onSuccess?.();
    });
    useCreateConnectionRequest.mockReturnValue({ mutate, isPending: false });
    useVisibleVehicles.mockReturnValue({ data: [PEER_VEHICLE], isPending: false });
    const user = userEvent.setup();

    await renderWithRouter(<CatalogoPage />);
    await waitFor(() => expect(getUser).toHaveBeenCalled());
    await user.click(screen.getByTestId("catalog-interest-button"));

    expect(screen.getByTestId("catalog-interest-sent")).toHaveTextContent("Solicitud enviada");
  });
});
