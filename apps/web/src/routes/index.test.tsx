import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithRouter } from "../test/render-with-router";

const useSessionClaims = vi.fn();
const signOut = vi.fn();
const useOwnTenantVehicles = vi.fn();
const useOwnSearchRequests = vi.fn();
const useMyConnectionEdges = vi.fn();
const useMyConnectionRequests = vi.fn();
const useReputationScore = vi.fn();
const useRecentIncomingMessages = vi.fn();
const useTenantDirectoryEntry = vi.fn();

vi.mock("@/features/identity-bridge", () => ({
  supabaseClient: { auth: { signOut: () => signOut() } },
  useSessionClaims: () => useSessionClaims(),
}));

vi.mock("@/features/vehicle-sync", () => ({
  useOwnTenantVehicles: () => useOwnTenantVehicles(),
}));

vi.mock("@/features/targeted-search", () => ({
  useOwnSearchRequests: (tenantId: string | undefined) => useOwnSearchRequests(tenantId),
}));

vi.mock("@/features/network-connections", () => ({
  useMyConnectionEdges: () => useMyConnectionEdges(),
  useMyConnectionRequests: () => useMyConnectionRequests(),
}));

vi.mock("@/features/partner-reputation", () => ({
  useReputationScore: (tenantId: string | undefined) => useReputationScore(tenantId),
}));

vi.mock("@/features/connection-messaging", () => ({
  useRecentIncomingMessages: (tenantId: string | undefined) => useRecentIncomingMessages(tenantId),
}));

vi.mock("@/features/tenant-directory", () => ({
  useTenantDirectoryEntry: (tenantId: string | undefined) => useTenantDirectoryEntry(tenantId),
}));

import { HomePage } from "./index";

const TENANT_ID = "a0000000-0000-4000-8000-000000000001";
const OTHER_TENANT_ID = "c0000000-0000-4000-8000-000000000003";

const VEHICLE = {
  id: "b0000000-0000-4000-8000-000000000001",
  make: "Toyota",
  model: "Corolla",
  year: 2020,
  allyPrice: 80_000_000,
  minPrice: 75_000_000,
  status: "available",
  viewsCount: 12,
  visibilityTier: "owner" as const,
};

function authenticatedSession() {
  return {
    data: {
      status: "authenticated",
      claims: { tenantId: TENANT_ID, role: "dealer_admin", redAliadosEnabled: true },
    },
  };
}

describe("HomePage", () => {
  beforeEach(() => {
    useSessionClaims.mockReset();
    signOut.mockReset();
    useOwnTenantVehicles.mockReset();
    useOwnSearchRequests.mockReset();
    useMyConnectionEdges.mockReset();
    useMyConnectionRequests.mockReset();
    useReputationScore.mockReset();
    useRecentIncomingMessages.mockReset();
    useTenantDirectoryEntry.mockReset();

    useSessionClaims.mockReturnValue(authenticatedSession());
    useOwnSearchRequests.mockReturnValue({ data: [], isPending: false });
    useMyConnectionEdges.mockReturnValue({ data: [], isPending: false });
    useMyConnectionRequests.mockReturnValue({ data: [], isPending: false });
    useReputationScore.mockReturnValue({ score: null, sampleSize: 0, isLoading: false });
    useRecentIncomingMessages.mockReturnValue({ data: [], isPending: false });
    useTenantDirectoryEntry.mockReturnValue({ entry: null, isLoading: false });
  });

  it("greets with the tenant's own name once the directory entry loads", async () => {
    useOwnTenantVehicles.mockReturnValue({ data: [], isPending: false });
    useTenantDirectoryEntry.mockReturnValue({
      entry: { tenantName: "Concesionaria Test Norte", contactPhone: null },
      isLoading: false,
    });

    await renderWithRouter(<HomePage />);

    expect(screen.getByTestId("dashboard-greeting")).toHaveTextContent(
      "Hola, Concesionaria Test Norte",
    );
  });

  it("falls back to a generic greeting (never a fabricated human name) before the directory resolves", async () => {
    useOwnTenantVehicles.mockReturnValue({ data: [], isPending: false });

    await renderWithRouter(<HomePage />);

    expect(screen.getByTestId("dashboard-greeting")).toHaveTextContent("Hola, tu concesionaria");
  });

  it("only offers real CTAs -- Publicar solicitud and Ver tu red -- never a vehicle-creation action", async () => {
    useOwnTenantVehicles.mockReturnValue({ data: [], isPending: false });

    await renderWithRouter(<HomePage />);

    expect(screen.getByTestId("dashboard-cta-solicitudes")).toHaveAttribute("href", "/solicitudes");
    expect(screen.getByTestId("dashboard-cta-red")).toHaveAttribute("href", "/red");
    expect(screen.queryByText(/publicar vehículo/i)).not.toBeInTheDocument();
  });

  it("shows a loading state while vehicles are pending", async () => {
    useOwnTenantVehicles.mockReturnValue({ data: undefined, isPending: true });

    await renderWithRouter(<HomePage />);

    expect(screen.getByTestId("vehicle-views-chart-loading")).toBeInTheDocument();
  });

  it("shows a friendly empty state for the chart when the tenant has no vehicles", async () => {
    useOwnTenantVehicles.mockReturnValue({ data: [], isPending: false });

    await renderWithRouter(<HomePage />);

    expect(screen.getByTestId("vehicle-views-chart-empty")).toBeInTheDocument();
  });

  it("renders the views chart once vehicles load", async () => {
    useOwnTenantVehicles.mockReturnValue({ data: [VEHICLE], isPending: false });

    await renderWithRouter(<HomePage />);

    expect(screen.getByTestId("vehicle-views-chart")).toBeInTheDocument();
    expect(screen.getAllByTestId("vehicle-views-bar")).toHaveLength(1);
  });

  it("computes the stat cards from real query results", async () => {
    useOwnTenantVehicles.mockReturnValue({ data: [VEHICLE], isPending: false });
    useOwnSearchRequests.mockReturnValue({
      data: [
        { id: "s1", status: "open" },
        { id: "s2", status: "closed" },
      ],
      isPending: false,
    });
    useMyConnectionEdges.mockReturnValue({
      data: [{ id: "e1", visibleTenantId: OTHER_TENANT_ID, connectionRequestId: "r1" }],
      isPending: false,
    });
    useReputationScore.mockReturnValue({ score: 82, sampleSize: 4, isLoading: false });

    await renderWithRouter(<HomePage />);

    expect(screen.getByTestId("stat-card-vehicles")).toHaveTextContent("1");
    expect(screen.getByTestId("stat-card-search-requests")).toHaveTextContent("1");
    expect(screen.getByTestId("stat-card-connections")).toHaveTextContent("1");
    // 82 / 20 = 4.1 -- a legitimate presentational transform of the real score.
    expect(screen.getByTestId("stat-card-reputation")).toHaveTextContent("4.1");
    expect(screen.getByTestId("stat-card-reputation")).toHaveTextContent("4 operaciones");
  });

  it("shows an honest unrated state for reputation instead of a fake number", async () => {
    useOwnTenantVehicles.mockReturnValue({ data: [], isPending: false });
    useReputationScore.mockReturnValue({ score: null, sampleSize: 0, isLoading: false });

    await renderWithRouter(<HomePage />);

    expect(screen.getByTestId("stat-reputation-unrated")).toHaveTextContent(
      "Sin calificar todavía",
    );
  });

  it("shows a loading state for the activity feed while its sources are pending", async () => {
    useOwnTenantVehicles.mockReturnValue({ data: [], isPending: false });
    useMyConnectionRequests.mockReturnValue({ data: undefined, isPending: true });

    await renderWithRouter(<HomePage />);

    expect(screen.getByTestId("activity-feed-loading")).toBeInTheDocument();
  });

  it("shows an honest empty state when there is no activity yet", async () => {
    useOwnTenantVehicles.mockReturnValue({ data: [], isPending: false });

    await renderWithRouter(<HomePage />);

    expect(screen.getByTestId("activity-feed-empty")).toHaveTextContent(
      "Todavía no hay actividad reciente.",
    );
  });

  it("merges accepted connections and incoming messages into one feed, newest first", async () => {
    useOwnTenantVehicles.mockReturnValue({ data: [], isPending: false });
    useMyConnectionRequests.mockReturnValue({
      data: [
        {
          id: "req-1",
          requester_tenant_id: TENANT_ID,
          recipient_tenant_id: OTHER_TENANT_ID,
          status: "accepted",
          responded_at: "2026-08-01T12:00:00.000Z",
          updated_at: "2026-08-01T12:00:00.000Z",
        },
        {
          id: "req-2",
          requester_tenant_id: OTHER_TENANT_ID,
          recipient_tenant_id: TENANT_ID,
          status: "pending",
          responded_at: null,
          updated_at: "2026-08-01T10:00:00.000Z",
        },
      ],
      isPending: false,
    });
    useRecentIncomingMessages.mockReturnValue({
      data: [
        {
          id: "m1",
          connection_request_id: "req-1",
          sender_tenant_id: OTHER_TENANT_ID,
          body: "Hola, tenemos interés en tu Corolla",
          created_at: "2026-08-03T11:00:00.000Z",
        },
      ],
      isPending: false,
    });

    await renderWithRouter(<HomePage />);

    const items = screen.getAllByTestId("activity-item");
    // Newest first: the message (11:00 on 08-03) before the accepted
    // connection (08-01) -- the still-pending request never appears at all.
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("Nuevo mensaje");
    expect(items[0]).toHaveTextContent("interés en tu Corolla");
    expect(items[1]).toHaveTextContent("Se aceptó una nueva conexión.");
  });

  it("calls supabaseClient.auth.signOut when Cerrar sesión is clicked", async () => {
    useOwnTenantVehicles.mockReturnValue({ data: [], isPending: false });
    const user = userEvent.setup();

    await renderWithRouter(<HomePage />);
    await user.click(screen.getByTestId("sign-out-button"));

    expect(signOut).toHaveBeenCalledTimes(1);
  });
});
