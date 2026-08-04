import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionClaims } from "../../identity-bridge/domain/session-claims";

const useSessionClaims = vi.fn();

vi.mock("@/features/identity-bridge", () => ({
  useSessionClaims: () => useSessionClaims(),
}));

const fetchHasNetworkAccess = vi.fn();
const fetchIsConnected = vi.fn();
const fetchHasCandidateLink = vi.fn();
const fetchTenantDirectoryEntry = vi.fn();
const fetchReputationSummary = vi.fn();

vi.mock("../data/tenant-directory-queries", () => ({
  fetchHasNetworkAccess: () => fetchHasNetworkAccess(),
  fetchIsConnected: (targetTenantId: string) => fetchIsConnected(targetTenantId),
  fetchHasCandidateLink: (targetTenantId: string) => fetchHasCandidateLink(targetTenantId),
  fetchTenantDirectoryEntry: (targetTenantId: string) => fetchTenantDirectoryEntry(targetTenantId),
  fetchReputationSummary: (targetTenantId: string) => fetchReputationSummary(targetTenantId),
}));

import { useTenantDirectoryEntry } from "./useTenantDirectoryEntry";

const CURRENT_TENANT = "11111111-1111-4111-8111-111111111111";
const TARGET_TENANT = "22222222-2222-4222-8222-222222222222";

function enabledClaims(): SessionClaims {
  return { tenantId: CURRENT_TENANT, role: "dealer_admin", redAliadosEnabled: true };
}

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe("useTenantDirectoryEntry", () => {
  beforeEach(() => {
    useSessionClaims.mockReturnValue({
      data: { status: "authenticated", claims: enabledClaims() },
    });
    fetchHasNetworkAccess.mockReset();
    fetchIsConnected.mockReset();
    fetchHasCandidateLink.mockReset();
    fetchTenantDirectoryEntry.mockReset();
    fetchReputationSummary.mockReset();
  });

  it("resolves tier 'none' and attempts neither the entry nor reputation query", async () => {
    fetchHasNetworkAccess.mockResolvedValue(true);
    fetchIsConnected.mockResolvedValue(false);
    fetchHasCandidateLink.mockResolvedValue(false);

    const { result } = renderHook(() => useTenantDirectoryEntry(TARGET_TENANT), { wrapper });

    await waitFor(() => expect(result.current.tier).toBe("none"));

    expect(fetchTenantDirectoryEntry).not.toHaveBeenCalled();
    expect(fetchReputationSummary).not.toHaveBeenCalled();
    expect(result.current.contactRevealed).toBe(false);
    expect(result.current.reputationVisible).toBe(false);
    expect(result.current.entry).toBeNull();
  });

  it("resolves tier 'candidate' and reveals reputation but not contact", async () => {
    fetchHasNetworkAccess.mockResolvedValue(true);
    fetchIsConnected.mockResolvedValue(false);
    fetchHasCandidateLink.mockResolvedValue(true);
    fetchTenantDirectoryEntry.mockResolvedValue({
      tenantId: TARGET_TENANT,
      tenantName: null,
      contactPhone: null,
      tier: "candidate",
    });
    fetchReputationSummary.mockResolvedValue({
      acceptedCount: 2,
      rejectedCount: 0,
      expiredCount: 0,
      totalCount: 2,
    });

    const { result } = renderHook(() => useTenantDirectoryEntry(TARGET_TENANT), { wrapper });

    await waitFor(() => expect(result.current.tier).toBe("candidate"));
    await waitFor(() => expect(result.current.reputation).not.toBeNull());

    expect(result.current.contactRevealed).toBe(false);
    expect(result.current.reputationVisible).toBe(true);
    expect(result.current.entry?.contactPhone).toBeNull();
    expect(result.current.reputation?.acceptedCount).toBe(2);
  });

  it("resolves tier 'connected' and reveals both reputation and contact", async () => {
    fetchHasNetworkAccess.mockResolvedValue(true);
    fetchIsConnected.mockResolvedValue(true);
    fetchHasCandidateLink.mockResolvedValue(false);
    fetchTenantDirectoryEntry.mockResolvedValue({
      tenantId: TARGET_TENANT,
      tenantName: "Acme Motors",
      contactPhone: "+52 55 1234 5678",
      tier: "connected",
    });
    fetchReputationSummary.mockResolvedValue({
      acceptedCount: 3,
      rejectedCount: 1,
      expiredCount: 0,
      totalCount: 4,
    });

    const { result } = renderHook(() => useTenantDirectoryEntry(TARGET_TENANT), { wrapper });

    await waitFor(() => expect(result.current.tier).toBe("connected"));
    await waitFor(() => expect(result.current.entry?.contactPhone).toBe("+52 55 1234 5678"));

    expect(result.current.contactRevealed).toBe(true);
    expect(result.current.reputationVisible).toBe(true);
  });
});
