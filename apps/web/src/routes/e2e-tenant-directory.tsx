import { createFileRoute } from "@tanstack/react-router";
import { useVisibilityTier } from "@/features/network-authorization";
import { CandidateCard, isReputationVisible } from "@/features/tenant-directory";

// E2E-ONLY test harness (task 5.4), never linked from real navigation.
// Proves the masking is real in a real browser render: a candidate-tier
// target shows reputation with the phone masked; a tier-'none' target (no
// linking connection_requests row at all) renders zero candidate cards.
// Scenario inputs are seeded via URL search params by
// apps/web/e2e/tenant-directory.spec.ts. Gated behind e2e build mode (`vite
// build --mode e2e`), same test-seam pattern identity-bridge/
// network-authorization already established.
//
// Fixture data stands in for a real Supabase row/reputation summary --
// there is no live Supabase project to query yet (same "documented
// verification gap" as PR2/PR3/PR4). The real, unit-tested query functions
// (fetchTenantDirectoryEntry, fetchReputationSummary,
// see features/tenant-directory/data/tenant-directory-queries.ts) are
// exercised by Vitest instead. What this proves is the CLIENT-side masking
// (useVisibilityTier -> CandidateCard), not a live RLS round trip.
export const Route = createFileRoute("/e2e-tenant-directory")({
  component: TenantDirectoryHarnessRoute,
});

function TenantDirectoryHarnessRoute() {
  if (import.meta.env.MODE !== "e2e") {
    return null;
  }

  return <TenantDirectoryHarness />;
}

const FIXTURE_REPUTATION = {
  acceptedCount: 3,
  rejectedCount: 1,
  expiredCount: 0,
  totalCount: 4,
  score: 87,
};

function TenantDirectoryHarness() {
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

  const reputation = isReputationVisible(tier) ? FIXTURE_REPUTATION : null;
  // Mirrors what vehicle_snapshots_public already returns masked below the
  // 'connected' tier -- see fetchTenantDirectoryEntry.
  const tenantName = tier === "connected" || tier === "owner" ? "Acme Motors" : null;
  const contactPhone = tier === "connected" || tier === "owner" ? "+52 55 1234 5678" : null;

  return (
    <main>
      <p data-testid="tier">{tier}</p>
      {tier === "none" ? (
        <p data-testid="no-candidates">no candidates</p>
      ) : (
        <CandidateCard
          tier={tier}
          tenantName={tenantName}
          contactPhone={contactPhone}
          reputation={reputation}
        />
      )}
    </main>
  );
}
