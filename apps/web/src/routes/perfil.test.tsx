import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithRouter } from "../test/render-with-router";

const useSessionClaims = vi.fn();
const signOut = vi.fn();
const useTenantDirectoryEntry = vi.fn();
const useReputationScore = vi.fn();

vi.mock("@/features/identity-bridge", () => ({
  supabaseClient: { auth: { signOut: () => signOut() } },
  useSessionClaims: () => useSessionClaims(),
}));

vi.mock("@/features/tenant-directory", () => ({
  useTenantDirectoryEntry: (tenantId: string | undefined) => useTenantDirectoryEntry(tenantId),
}));

vi.mock("@/features/partner-reputation", () => ({
  useReputationScore: (tenantId: string | undefined) => useReputationScore(tenantId),
}));

const AUTHENTICATED_SESSION = {
  status: "authenticated" as const,
  claims: {
    tenantId: "11111111-1111-4111-8111-111111111111",
    role: "dealer_admin",
    redAliadosEnabled: true,
  },
};

describe("PerfilPage", () => {
  beforeEach(() => {
    useSessionClaims.mockReset();
    signOut.mockReset();
    useTenantDirectoryEntry.mockReset();
    useReputationScore.mockReset();
    useSessionClaims.mockReturnValue({ data: AUTHENTICATED_SESSION });
  });

  it("shows the tenant name, contact, and role once loaded", async () => {
    useTenantDirectoryEntry.mockReturnValue({
      isLoading: false,
      entry: { tenantName: "Concesionaria Test Norte", contactPhone: "+54 9 11 0000-0001" },
    });
    useReputationScore.mockReturnValue({ isLoading: false, score: null, sampleSize: 0 });

    const { PerfilPage } = await import("./perfil");
    await renderWithRouter(<PerfilPage />);

    expect(screen.getByTestId("profile-tenant-name")).toHaveTextContent("Concesionaria Test Norte");
    expect(screen.getByTestId("profile-contact-phone")).toHaveTextContent("+54 9 11 0000-0001");
    expect(screen.getByText("Administrador")).toBeInTheDocument();
  });

  it("shows the unrated message when there are no terminal reputation events yet", async () => {
    useTenantDirectoryEntry.mockReturnValue({ isLoading: false, entry: null });
    useReputationScore.mockReturnValue({ isLoading: false, score: null, sampleSize: 0 });

    const { PerfilPage } = await import("./perfil");
    await renderWithRouter(<PerfilPage />);

    expect(screen.getByTestId("reputation-unrated")).toBeInTheDocument();
  });

  it("shows the computed score and sample size once rated", async () => {
    useTenantDirectoryEntry.mockReturnValue({ isLoading: false, entry: null });
    useReputationScore.mockReturnValue({ isLoading: false, score: 82, sampleSize: 3 });

    const { PerfilPage } = await import("./perfil");
    await renderWithRouter(<PerfilPage />);

    expect(screen.getByTestId("reputation-score")).toHaveTextContent("82");
    expect(screen.getByTestId("reputation-sample-size")).toHaveTextContent("3 operaciones");
  });

  it("shows loading states while queries are pending", async () => {
    useTenantDirectoryEntry.mockReturnValue({ isLoading: true, entry: null });
    useReputationScore.mockReturnValue({ isLoading: true, score: null, sampleSize: 0 });

    const { PerfilPage } = await import("./perfil");
    await renderWithRouter(<PerfilPage />);

    expect(screen.getByTestId("profile-loading")).toBeInTheDocument();
    expect(screen.getByTestId("reputation-loading")).toBeInTheDocument();
  });
});
