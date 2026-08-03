import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithRouter } from "../test/render-with-router";

const useOwnTenantVehicles = vi.fn();
const signOut = vi.fn();

vi.mock("@/features/vehicle-sync", () => ({
  useOwnTenantVehicles: () => useOwnTenantVehicles(),
}));

vi.mock("@/features/identity-bridge", () => ({
  supabaseClient: { auth: { signOut: () => signOut() } },
}));

import { HomePage } from "./index";

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

describe("HomePage", () => {
  beforeEach(() => {
    useOwnTenantVehicles.mockReset();
    signOut.mockReset();
  });

  it("shows a loading state while vehicles are pending", async () => {
    useOwnTenantVehicles.mockReturnValue({ data: undefined, isPending: true });

    await renderWithRouter(<HomePage />);

    expect(screen.getByTestId("vehicles-loading")).toBeInTheDocument();
  });

  it("shows a friendly empty state when the tenant has no vehicles", async () => {
    useOwnTenantVehicles.mockReturnValue({ data: [], isPending: false });

    await renderWithRouter(<HomePage />);

    expect(screen.getByTestId("vehicles-empty")).toBeInTheDocument();
    expect(screen.queryByTestId("vehicle-card")).not.toBeInTheDocument();
  });

  it("renders a card per vehicle once loaded, with formatted prices", async () => {
    useOwnTenantVehicles.mockReturnValue({ data: [VEHICLE], isPending: false });

    await renderWithRouter(<HomePage />);

    const cards = screen.getAllByTestId("vehicle-card");
    expect(cards).toHaveLength(1);
    expect(cards[0]).toHaveTextContent("Toyota Corolla 2020");
    expect(cards[0]).toHaveTextContent("available");
  });

  it("calls supabaseClient.auth.signOut when Cerrar sesión is clicked", async () => {
    useOwnTenantVehicles.mockReturnValue({ data: [], isPending: false });
    const user = userEvent.setup();

    await renderWithRouter(<HomePage />);
    await user.click(screen.getByTestId("sign-out-button"));

    expect(signOut).toHaveBeenCalledTimes(1);
  });
});
