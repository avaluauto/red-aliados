import { describe, expect, it, vi } from "vitest";
import type { SessionClaims } from "../../identity-bridge/domain/session-claims";
import { useVisibilityTier } from "./useVisibilityTier";

const useSessionClaims = vi.fn();

vi.mock("@/features/identity-bridge", () => ({
  useSessionClaims: () => useSessionClaims(),
}));

const CURRENT_TENANT = "11111111-1111-4111-8111-111111111111";
const TARGET_TENANT = "22222222-2222-4222-8222-222222222222";

function enabledClaims(overrides: Partial<SessionClaims> = {}): SessionClaims {
  return { tenantId: CURRENT_TENANT, role: "dealer_admin", redAliadosEnabled: true, ...overrides };
}

describe("useVisibilityTier", () => {
  it("returns 'none' while the session is unauthenticated", () => {
    useSessionClaims.mockReturnValue({ data: { status: "unauthenticated" } });

    const tier = useVisibilityTier({
      targetTenantId: TARGET_TENANT,
      hasNetworkAccess: true,
      isConnected: true,
      hasCandidateLink: true,
    });

    expect(tier).toBe("none");
  });

  it("returns 'none' while session data has not resolved yet", () => {
    useSessionClaims.mockReturnValue({ data: undefined });

    const tier = useVisibilityTier({
      targetTenantId: TARGET_TENANT,
      hasNetworkAccess: true,
      isConnected: true,
      hasCandidateLink: true,
    });

    expect(tier).toBe("none");
  });

  it("returns 'none' when no targetTenantId is known yet", () => {
    useSessionClaims.mockReturnValue({
      data: { status: "authenticated", claims: enabledClaims() },
    });

    const tier = useVisibilityTier({
      targetTenantId: undefined,
      hasNetworkAccess: true,
      isConnected: true,
      hasCandidateLink: true,
    });

    expect(tier).toBe("none");
  });

  it("returns 'owner' for the caller's own tenant", () => {
    useSessionClaims.mockReturnValue({
      data: { status: "authenticated", claims: enabledClaims() },
    });

    const tier = useVisibilityTier({
      targetTenantId: CURRENT_TENANT,
      hasNetworkAccess: false,
      isConnected: false,
      hasCandidateLink: false,
    });

    expect(tier).toBe("owner");
  });

  it("delegates cross-tenant resolution to the domain layer", () => {
    useSessionClaims.mockReturnValue({
      data: { status: "authenticated", claims: enabledClaims() },
    });

    const tier = useVisibilityTier({
      targetTenantId: TARGET_TENANT,
      hasNetworkAccess: true,
      isConnected: true,
      hasCandidateLink: false,
    });

    expect(tier).toBe("connected");
  });

  it("returns 'none' when the session's module-enabled claim is false", () => {
    useSessionClaims.mockReturnValue({
      data: { status: "authenticated", claims: enabledClaims({ redAliadosEnabled: false }) },
    });

    const tier = useVisibilityTier({
      targetTenantId: TARGET_TENANT,
      hasNetworkAccess: true,
      isConnected: true,
      hasCandidateLink: true,
    });

    expect(tier).toBe("none");
  });
});
