import { createFileRoute } from "@tanstack/react-router";
import { ReputationBadge, useReputationScore } from "@/features/partner-reputation";

// E2E-ONLY test harness (task 7.3), never linked from real navigation. Wires
// the REAL useReputationScore hook + ReputationBadge component together,
// exercising the actual query call shape
// (supabaseClient.from("reputation_events").select(...).eq("tenant_id", ...))
// in a real browser. Renders two badges side by side for two DIFFERENT
// tenant ids taken from the URL (leftTenantId/rightTenantId) so a single
// test can seed one tenant's mocked reputation_events response as
// 'rejected' and the other as 'expired' and assert the rendered scores
// diverge (partner-reputation: "Expiry penalizes more than rejection of
// equivalent context").
//
// There is no live red-aliados Supabase project yet (see
// supabase/THIRD_PARTY_AUTH.md, "Status: NOT CONFIGURED"), so
// apps/web/e2e/partner-reputation.spec.ts intercepts the underlying
// PostgREST call via `page.route` rather than hitting a real Postgres
// instance -- same documented-gap relationship every other feature's
// harness in this codebase has with a live round trip. What THIS proves is
// the CLIENT wiring end-to-end (hook -> computeReputationScore -> render),
// not that the DB trigger (app.emit_reputation_event,
// supabase/migrations/0008_reputation_events_trigger.sql) itself produced
// those rows -- the mocked reputation_events response stands in for what
// that trigger would have written. The trigger itself is proven separately,
// for real, against a disposable local Postgres database (see this PR's
// apply-progress and supabase/tests/database/0008_reputation_events_trigger.test.sql).
export const Route = createFileRoute("/e2e-partner-reputation")({
  component: PartnerReputationHarnessRoute,
});

function PartnerReputationHarnessRoute() {
  if (import.meta.env.MODE !== "e2e") {
    return null;
  }

  return <PartnerReputationHarness />;
}

function PartnerReputationHarness() {
  const params = new URLSearchParams(window.location.search);
  const leftTenantId = params.get("leftTenantId") ?? undefined;
  const rightTenantId = params.get("rightTenantId") ?? undefined;

  const left = useReputationScore(leftTenantId);
  const right = useReputationScore(rightTenantId);

  return (
    <main>
      <section data-testid="reputation-left">
        <ReputationBadge score={left.score} sampleSize={left.sampleSize} />
      </section>
      <section data-testid="reputation-right">
        <ReputationBadge score={right.score} sampleSize={right.sampleSize} />
      </section>
    </main>
  );
}
