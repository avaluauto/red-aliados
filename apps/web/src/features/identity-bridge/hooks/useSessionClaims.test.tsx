import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchSessionResult = vi.fn();
const subscribeToAuthChanges = vi.fn();

vi.mock("../data/session", () => ({
  fetchSessionResult,
  subscribeToAuthChanges,
}));

const VALID_TENANT_ID = "11111111-1111-4111-8111-111111111111";

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe("useSessionClaims", () => {
  beforeEach(() => {
    fetchSessionResult.mockReset();
    subscribeToAuthChanges.mockReset();
    subscribeToAuthChanges.mockReturnValue(vi.fn());
  });

  it("resolves to authenticated state with parsed claims for a valid session", async () => {
    fetchSessionResult.mockResolvedValue({
      status: "authenticated",
      rawClaims: {
        tenant_id: VALID_TENANT_ID,
        app_role: "dealer_admin",
        red_aliados_enabled: true,
      },
    });

    const { useSessionClaims } = await import("./useSessionClaims");
    const { result } = renderHook(() => useSessionClaims(), { wrapper });

    await waitFor(() => expect(result.current.isPending).toBe(false));

    expect(result.current.data).toEqual({
      status: "authenticated",
      claims: { tenantId: VALID_TENANT_ID, role: "dealer_admin", redAliadosEnabled: true },
    });
  });

  it("resolves to unauthenticated when there is no session", async () => {
    fetchSessionResult.mockResolvedValue({ status: "unauthenticated" });

    const { useSessionClaims } = await import("./useSessionClaims");
    const { result } = renderHook(() => useSessionClaims(), { wrapper });

    await waitFor(() => expect(result.current.isPending).toBe(false));

    expect(result.current.data).toEqual({ status: "unauthenticated" });
  });

  it("treats a session whose claims fail validation as unauthenticated", async () => {
    fetchSessionResult.mockResolvedValue({
      status: "authenticated",
      rawClaims: { app_role: "dealer_admin" }, // missing tenant_id
    });

    const { useSessionClaims } = await import("./useSessionClaims");
    const { result } = renderHook(() => useSessionClaims(), { wrapper });

    await waitFor(() => expect(result.current.isPending).toBe(false));

    expect(result.current.data).toEqual({ status: "unauthenticated" });
  });

  it("subscribes to auth changes on mount", async () => {
    fetchSessionResult.mockResolvedValue({ status: "unauthenticated" });

    const { useSessionClaims } = await import("./useSessionClaims");
    renderHook(() => useSessionClaims(), { wrapper });

    await waitFor(() => expect(subscribeToAuthChanges).toHaveBeenCalledTimes(1));
  });
});
