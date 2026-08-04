import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  type SearchMatch,
  SearchMatchList,
  useOptInFanOut,
  useProceedOnMatch,
  useSearchMatches,
} from "@/features/targeted-search";

// E2E-ONLY test harness (task 9.4), never linked from real navigation. Wires
// the REAL useSearchMatches/useOptInFanOut/useProceedOnMatch hooks +
// SearchMatchList component together, exercising the actual query/mutation
// call shape against `supabaseClient` in a real browser -- same test-seam
// pattern PR5/PR6/PR7/PR8's harnesses established.
//
// There is no live red-aliados Supabase project yet (see
// supabase/THIRD_PARTY_AUTH.md, "Status: NOT CONFIGURED"), so
// apps/web/e2e/targeted-search.spec.ts intercepts the underlying PostgREST
// calls via `page.route` rather than hitting a real Postgres instance. This
// proves the CLIENT wiring end-to-end -- most importantly, that
// useOptInFanOut's own connected-tenant read (fetchConnectedTenantIds) is
// what actually gates the search_request_targets insert, not the
// `candidateTenantIds` seed alone -- not that RLS itself
// (insert_own_search_request_targets, supabase/migrations/
// 0003_rls_policies.sql) would reject a bypassing direct call. That remains
// a documented verification gap, same as PR3/PR6/PR8's own skipped
// RLS-bypass proofs.
//
// The search_requests row itself (task 9.2's createSearchRequest) is seeded
// via URL param here rather than created through the UI -- this harness
// isolates the fan-out/match/proceed flow (task 9.4's exact scope), the same
// way e2e-connection-messaging.tsx seeds an existing connection_request
// rather than re-proving network-connections' own create flow.
export const Route = createFileRoute("/e2e-targeted-search")({
  component: TargetedSearchHarnessRoute,
});

function TargetedSearchHarnessRoute() {
  if (import.meta.env.MODE !== "e2e") {
    return null;
  }

  return <TargetedSearchHarness />;
}

function TargetedSearchHarness() {
  const params = new URLSearchParams(window.location.search);
  const tenantId = params.get("tenantId") ?? "";
  const searchRequestId = params.get("searchRequestId") ?? "";
  const currentUserId = params.get("currentUserId") ?? "";
  const candidateTenantIds = (params.get("candidateTenantIds") ?? "").split(",").filter(Boolean);

  const [fanOutEnabled, setFanOutEnabled] = useState(false);
  const [lastProceededMatchId, setLastProceededMatchId] = useState<string | null>(null);

  const optIn = useOptInFanOut();
  const proceed = useProceedOnMatch();
  const { matches, isLoading } = useSearchMatches({ tenantId, searchRequestId, fanOutEnabled });

  function handleOptIn() {
    optIn.mutate(
      { searchRequestId, candidateTenantIds },
      { onSuccess: () => setFanOutEnabled(true) },
    );
  }

  function handleProceed(match: SearchMatch) {
    proceed.mutate(
      {
        searchRequestId,
        vehicleSnapshotId: match.vehicleSnapshotId,
        matchedTenantId: match.matchOwnerTenantId,
        proceededBy: currentUserId,
      },
      { onSuccess: (row) => setLastProceededMatchId(row.id) },
    );
  }

  if (isLoading) {
    return (
      <main>
        <p data-testid="targeted-search-loading">loading</p>
      </main>
    );
  }

  return (
    <main>
      <SearchMatchList
        matches={matches}
        fanOutEnabled={fanOutEnabled}
        isOptingIn={optIn.isPending}
        isProceeding={proceed.isPending}
        onOptInFanOut={handleOptIn}
        onProceed={handleProceed}
      />
      {lastProceededMatchId ? (
        <p data-testid="targeted-search-opportunity-created">{lastProceededMatchId}</p>
      ) : null}
    </main>
  );
}
