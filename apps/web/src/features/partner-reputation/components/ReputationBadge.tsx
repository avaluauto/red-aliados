// Presentational (spec: Score Computation and Expiry Penalty, Score is
// read-only). No `../data` or `../hooks` import -- same "pure render" rule
// every presentational component in this codebase follows
// (CandidateCard/ConnectionRequestCard/RequestConnectionButton).
export interface ReputationBadgeProps {
  readonly score: number | null;
  readonly sampleSize: number;
}

export function ReputationBadge({ score, sampleSize }: ReputationBadgeProps) {
  if (score === null) {
    return (
      <span data-testid="reputation-badge-unrated" className="text-xs italic text-slate-500">
        Not yet rated
      </span>
    );
  }

  return (
    <span
      data-testid="reputation-badge-score"
      data-score={score}
      className="text-xs font-semibold text-slate-700"
    >
      {score.toFixed(0)} ({sampleSize} {sampleSize === 1 ? "response" : "responses"})
    </span>
  );
}
