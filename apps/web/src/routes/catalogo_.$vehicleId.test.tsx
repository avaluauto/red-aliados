import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const useSessionClaims = vi.fn();
const getUser = vi.fn();
const useVisibleVehicles = vi.fn();
const useVehiclePhotos = vi.fn();
const useCreateConnectionRequest = vi.fn();
const useCreateSearchRequest = vi.fn();
const useReputationScore = vi.fn();

vi.mock("@/features/identity-bridge", () => ({
  supabaseClient: {
    auth: {
      getUser: () => getUser(),
    },
  },
  useSessionClaims: () => useSessionClaims(),
}));

vi.mock("@/features/vehicle-sync", () => ({
  useVisibleVehicles: () => useVisibleVehicles(),
  useVehiclePhotos: (vehicleId: string | undefined) => useVehiclePhotos(vehicleId),
}));

vi.mock("@/features/network-connections", () => ({
  useCreateConnectionRequest: () => useCreateConnectionRequest(),
}));

vi.mock("@/features/targeted-search", () => ({
  useCreateSearchRequest: () => useCreateSearchRequest(),
}));

vi.mock("@/features/partner-reputation", () => ({
  useReputationScore: (tenantId: string | undefined) => useReputationScore(tenantId),
}));

import { VehicleDetailPage } from "./catalogo_.$vehicleId";

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

// Builds a minimal in-memory router with a "/catalogo/$vehicleId" route
// (rendering VehicleDetailPage) plus a stand-in "/catalogo" route, mirroring
// src/test/render-with-router.tsx's approach but parameterized -- that
// shared helper only ever mounts a plain "/" route, which can't exercise
// Route.useParams() here.
async function renderDetailRoute(vehicleId: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  const rootRoute = createRootRoute();
  const catalogoRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/catalogo",
    component: () => <p>Catálogo</p>,
  });
  const detailRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/catalogo/$vehicleId",
    component: VehicleDetailPage,
  });
  // Stand-in target for VehicleDetailPage's "Solicitar similar" ->
  // navigate({ to: "/solicitudes" }) on success -- same reasoning
  // src/test/render-with-router.tsx's stand-in "/login" route documents.
  const solicitudesRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/solicitudes",
    component: () => <p>Solicitudes</p>,
  });
  const routeTree = rootRoute.addChildren([catalogoRoute, detailRoute, solicitudesRoute]);
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [`/catalogo/${vehicleId}`] }),
  });

  await router.load();

  const result = render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );

  return { ...result, router };
}

describe("VehicleDetailPage", () => {
  beforeEach(() => {
    useSessionClaims.mockReset();
    getUser.mockReset();
    useVisibleVehicles.mockReset();
    useVehiclePhotos.mockReset();
    useCreateConnectionRequest.mockReset();
    useCreateSearchRequest.mockReset();
    useReputationScore.mockReset();

    useSessionClaims.mockReturnValue(authenticatedSession());
    getUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null });
    useVehiclePhotos.mockReturnValue({ data: [], isPending: false });
    useCreateConnectionRequest.mockReturnValue({ mutate: vi.fn(), isPending: false });
    useCreateSearchRequest.mockReturnValue({ mutate: vi.fn(), isPending: false });
    useReputationScore.mockReturnValue({ score: null, sampleSize: 0, isLoading: false });
  });

  it("renders real vehicle data for the matching id", async () => {
    useVisibleVehicles.mockReturnValue({ data: [OWN_VEHICLE, PEER_VEHICLE], isPending: false });

    await renderDetailRoute("v2");

    expect(screen.getByRole("heading", { name: "Mazda CX-5" })).toBeInTheDocument();
    expect(screen.getByTestId("vehicle-detail-price")).toHaveTextContent("$ 120.000.000");
    expect(screen.getByTestId("vehicle-detail-views")).toHaveTextContent("4 vistas");
    expect(screen.getByTestId("vehicle-identity-name")).toHaveTextContent("Motos del Sur");
    expect(screen.getByTestId("vehicle-identity-phone")).toHaveTextContent("+57 300 1234567");
  });

  it("shows an honest masking explanation when identity isn't revealed", async () => {
    const maskedVehicle = { ...PEER_VEHICLE, tenantName: null, contactPhone: null };
    useVisibleVehicles.mockReturnValue({ data: [maskedVehicle], isPending: false });

    await renderDetailRoute("v2");

    expect(screen.getByTestId("vehicle-identity-masked")).toHaveTextContent(
      "Identidad oculta hasta aceptar conexión.",
    );
  });

  it("shows a single placeholder area, not fabricated photos, when there are no photos", async () => {
    useVisibleVehicles.mockReturnValue({ data: [OWN_VEHICLE], isPending: false });
    useVehiclePhotos.mockReturnValue({ data: [], isPending: false });

    await renderDetailRoute("v1");

    expect(screen.getByTestId("vehicle-photo-placeholder")).toBeInTheDocument();
    expect(screen.queryByTestId("vehicle-photo-main")).not.toBeInTheDocument();
  });

  it("renders a main photo and thumbnails when photos exist", async () => {
    useVisibleVehicles.mockReturnValue({ data: [OWN_VEHICLE], isPending: false });
    useVehiclePhotos.mockReturnValue({
      data: [
        { id: "p1", url: "https://example.com/1.jpg", position: 0 },
        { id: "p2", url: "https://example.com/2.jpg", position: 1 },
      ],
      isPending: false,
    });

    await renderDetailRoute("v1");

    expect(screen.getByTestId("vehicle-photo-main")).toHaveAttribute(
      "src",
      "https://example.com/1.jpg",
    );
    expect(screen.getAllByTestId("vehicle-photo-thumbnail")).toHaveLength(2);
  });

  it("hides 'Me interesa' for the caller's own vehicle", async () => {
    useVisibleVehicles.mockReturnValue({ data: [OWN_VEHICLE], isPending: false });

    await renderDetailRoute("v1");

    expect(screen.queryByTestId("vehicle-interest-button")).not.toBeInTheDocument();
  });

  it("shows 'Me interesa' for a peer's vehicle and calls the mutation with the right args", async () => {
    const mutate = vi.fn();
    useCreateConnectionRequest.mockReturnValue({ mutate, isPending: false });
    useVisibleVehicles.mockReturnValue({ data: [PEER_VEHICLE], isPending: false });
    const user = userEvent.setup();

    await renderDetailRoute("v2");
    await waitFor(() => expect(getUser).toHaveBeenCalled());
    await user.click(screen.getByTestId("vehicle-interest-button"));

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

  it("'Solicitar similar' calls the mutation with make/model criteria and navigates to /solicitudes on success", async () => {
    const mutate = vi.fn((_input, options?: { onSuccess?: () => void }) => {
      options?.onSuccess?.();
    });
    useCreateSearchRequest.mockReturnValue({ mutate, isPending: false });
    useVisibleVehicles.mockReturnValue({ data: [PEER_VEHICLE], isPending: false });
    const user = userEvent.setup();

    const { router } = await renderDetailRoute("v2");
    await waitFor(() => expect(getUser).toHaveBeenCalled());
    await user.click(screen.getByTestId("vehicle-request-similar-button"));

    expect(mutate).toHaveBeenCalledWith(
      {
        tenantId: TENANT_ID,
        requestedBy: USER_ID,
        criteria: { make: "Mazda", model: "CX-5" },
      },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
    await waitFor(() => expect(router.state.location.pathname).toBe("/solicitudes"));
  });

  it("shows an honest not-found state for an unknown vehicle id, with a link back to /catalogo", async () => {
    useVisibleVehicles.mockReturnValue({ data: [OWN_VEHICLE], isPending: false });

    await renderDetailRoute("does-not-exist");

    expect(screen.getByTestId("vehicle-detail-not-found")).toHaveTextContent(
      "No encontramos este vehículo, o ya no está visible para vos.",
    );
    expect(screen.getByRole("link", { name: "Volver al catálogo" })).toBeInTheDocument();
  });
});
