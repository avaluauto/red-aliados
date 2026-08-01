import { createFileRoute } from "@tanstack/react-router";
import { useGuardedQuery, useVisibilityTier } from "@/features/network-authorization";

// E2E-ONLY test harness (task 3.3(a)), never linked from real navigation.
// Proves the guard mechanism end-to-end in a real browser: a client whose
// visibility guard resolves 'none' for a target tenant never even attempts
// the guarded data-fetching query, so no cross-tenant data can render.
// Scenario inputs are seeded via URL search params by
// apps/web/e2e/network-authorization.spec.ts. Gated behind e2e build mode
// (`vite build --mode e2e`) so it renders nothing in real dev/production
// builds -- same test-seam pattern identity-bridge already established
// (see src/features/identity-bridge/data/session.ts).
//
// This is infrastructure proof only, not a product feature: the real
// candidate-card / peer-inventory UI that will consume useVisibilityTier +
// useGuardedQuery for real cross-tenant data lands in later phases
// (tenant-directory, PR5+).
export const Route = createFileRoute("/e2e-network-guard")({
  component: NetworkGuardHarnessRoute,
});

declare global {
  var __RED_ALIADOS_E2E_GUARD_QUERY_CALLS__: number | undefined;
}

function NetworkGuardHarnessRoute() {
  if (import.meta.env.MODE !== "e2e") {
    return null;
  }

  return <NetworkGuardHarness />;
}

function NetworkGuardHarness() {
  const params = new URLSearchParams(window.location.search);
  const targetTenantId = params.get("targetTenantId") ?? undefined;
  const hasNetworkAccess = params.get("hasNetworkAccess") === "true";
  const isConnected = params.get("isConnected") === "true";
  const hasCandidateLink = params.get("hasCandidateLink") === "true";

  const tier = useVisibilityTier({
    targetTenantId,
    hasNetworkAccess,
    isConnected,
    hasCandidateLink,
  });

  const query = useGuardedQuery<{ crossTenantSecret: string }>(tier, {
    queryKey: ["e2e-network-guard", targetTenantId],
    queryFn: async () => {
      // Only ever reached when the guard has already decided the tier is
      // NOT 'none' -- this counter is what the Playwright spec asserts
      // stays at zero for an unconnected/candidate-less target.
      globalThis.__RED_ALIADOS_E2E_GUARD_QUERY_CALLS__ =
        (globalThis.__RED_ALIADOS_E2E_GUARD_QUERY_CALLS__ ?? 0) + 1;
      return { crossTenantSecret: "peer-vehicle-min-price-42000" };
    },
  });

  return (
    <main>
      <p data-testid="tier">{tier}</p>
      {query.data ? (
        <p data-testid="cross-tenant-data">{query.data.crossTenantSecret}</p>
      ) : (
        <p data-testid="no-data">no cross-tenant data</p>
      )}
    </main>
  );
}
