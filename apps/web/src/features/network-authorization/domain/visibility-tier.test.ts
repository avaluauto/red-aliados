import { describe, expect, it } from "vitest";
import { canAccessTarget, resolveVisibilityTier } from "./visibility-tier";

const CURRENT_TENANT = "11111111-1111-4111-8111-111111111111";
const TARGET_TENANT = "22222222-2222-4222-8222-222222222222";

const BASE_INPUT = {
  moduleEnabled: true,
  hasNetworkAccess: true,
  currentTenantId: CURRENT_TENANT,
  targetTenantId: TARGET_TENANT,
  isConnected: false,
  hasCandidateLink: false,
};

describe("resolveVisibilityTier", () => {
  it("returns 'none' when the module is disabled, regardless of everything else", () => {
    const tier = resolveVisibilityTier({
      ...BASE_INPUT,
      moduleEnabled: false,
      targetTenantId: CURRENT_TENANT,
      isConnected: true,
      hasCandidateLink: true,
    });

    expect(tier).toBe("none");
  });

  it("returns 'owner' for the caller's own tenant, independent of network access", () => {
    const tier = resolveVisibilityTier({
      ...BASE_INPUT,
      hasNetworkAccess: false,
      targetTenantId: CURRENT_TENANT,
    });

    expect(tier).toBe("owner");
  });

  it("returns 'none' for a cross-tenant target when the user has no network-access grant", () => {
    const tier = resolveVisibilityTier({ ...BASE_INPUT, hasNetworkAccess: false });

    expect(tier).toBe("none");
  });

  it("returns 'connected' when an active connection edge exists", () => {
    const tier = resolveVisibilityTier({ ...BASE_INPUT, isConnected: true });

    expect(tier).toBe("connected");
  });

  it("returns 'candidate' when linked by a suggested/pending request but not yet connected", () => {
    const tier = resolveVisibilityTier({ ...BASE_INPUT, hasCandidateLink: true });

    expect(tier).toBe("candidate");
  });

  it("prefers 'connected' over 'candidate' when both are true", () => {
    const tier = resolveVisibilityTier({
      ...BASE_INPUT,
      isConnected: true,
      hasCandidateLink: true,
    });

    expect(tier).toBe("connected");
  });

  it("returns 'none' for an unconnected tenant with no candidate link and network access granted", () => {
    const tier = resolveVisibilityTier(BASE_INPUT);

    expect(tier).toBe("none");
  });
});

describe("canAccessTarget", () => {
  it("is false only for 'none'", () => {
    expect(canAccessTarget("none")).toBe(false);
    expect(canAccessTarget("owner")).toBe(true);
    expect(canAccessTarget("connected")).toBe(true);
    expect(canAccessTarget("candidate")).toBe(true);
  });
});
