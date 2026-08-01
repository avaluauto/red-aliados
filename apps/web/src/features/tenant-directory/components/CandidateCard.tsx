// Presentational (spec: Reputation Visible Pre-Connection, Contact Reveal
// Gated by Acceptance). Renders nothing at all for tier 'none' -- there is
// no open directory browsing of the entire network (spec: "zero rows ...
// for that tenant").
//
// Mirrors the DB's own masking (vehicle_snapshots_public, 0004) as an
// independent UX double-check via the domain layer, same pattern
// network-authorization's client guard established: even though the query
// already returns null/nothing for a masked field, this component
// independently refuses to render it unless the domain rule agrees.
import type { VisibilityTier } from "@/features/network-authorization";
import { ReputationBadge } from "@/features/partner-reputation";
import type { ReputationSummary } from "../data/tenant-directory-queries";
import { isContactRevealed, isReputationVisible } from "../domain/visibility-rules";

export interface CandidateCardProps {
  readonly tier: VisibilityTier;
  readonly tenantName: string | null;
  readonly contactPhone: string | null;
  readonly reputation: ReputationSummary | null;
}

export function CandidateCard({ tier, tenantName, contactPhone, reputation }: CandidateCardProps) {
  if (tier === "none") {
    return null;
  }

  const contactRevealed = isContactRevealed(tier);
  const reputationVisible = isReputationVisible(tier);
  const displayName = tenantName ?? "Candidate dealer";

  return (
    <article
      data-testid="candidate-card"
      data-tier={tier}
      className="flex flex-col gap-2 rounded-lg border border-slate-200 p-4"
    >
      <h3 data-testid="candidate-name" className="text-base font-semibold">
        {displayName}
      </h3>

      {reputationVisible && reputation ? (
        <div className="flex flex-col gap-1">
          <p data-testid="candidate-reputation" className="text-sm text-slate-700">
            {reputation.acceptedCount} accepted &middot; {reputation.rejectedCount} rejected
            &middot; {reputation.expiredCount} expired
          </p>
          {/* Additive per partner-reputation (Phase 7): the real weighted
              score, computed from the same reputation_events rows the raw
              counts above already summarize -- see
              tenant-directory-queries.ts's fetchReputationSummary. Renders
              nothing extra (ReputationBadge's own "Not yet rated" state)
              when the tenant has zero terminal events yet, same
              null-is-unrated convention the domain layer establishes. */}
          <ReputationBadge score={reputation.score} sampleSize={reputation.totalCount} />
        </div>
      ) : null}

      {contactRevealed && contactPhone ? (
        <p data-testid="candidate-contact" className="text-sm font-medium">
          {contactPhone}
        </p>
      ) : (
        <p data-testid="candidate-contact-masked" className="text-sm text-slate-500 italic">
          Contact hidden until the connection is accepted
        </p>
      )}
    </article>
  );
}
