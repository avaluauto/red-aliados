import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CandidateCard } from "./CandidateCard";

const REPUTATION = {
  acceptedCount: 3,
  rejectedCount: 1,
  expiredCount: 0,
  totalCount: 4,
  score: 90,
};
const UNRATED_REPUTATION = {
  acceptedCount: 0,
  rejectedCount: 0,
  expiredCount: 0,
  totalCount: 0,
  score: null,
};

describe("CandidateCard", () => {
  it("renders nothing for tier 'none' -- no open directory browsing", () => {
    const { container } = render(
      <CandidateCard tier="none" tenantName={null} contactPhone={null} reputation={null} />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("shows reputation but masks the phone for a candidate-tier entry", () => {
    render(
      <CandidateCard
        tier="candidate"
        tenantName={null}
        contactPhone={null}
        reputation={REPUTATION}
      />,
    );

    expect(screen.getByTestId("candidate-reputation")).toBeInTheDocument();
    expect(screen.getByTestId("candidate-contact-masked")).toBeInTheDocument();
    expect(screen.queryByTestId("candidate-contact")).not.toBeInTheDocument();
  });

  it("shows both reputation and the real phone for a connected-tier entry", () => {
    render(
      <CandidateCard
        tier="connected"
        tenantName="Acme Motors"
        contactPhone="+52 55 1234 5678"
        reputation={REPUTATION}
      />,
    );

    expect(screen.getByTestId("candidate-reputation")).toBeInTheDocument();
    expect(screen.getByTestId("candidate-contact")).toHaveTextContent("+52 55 1234 5678");
    expect(screen.queryByTestId("candidate-contact-masked")).not.toBeInTheDocument();
  });

  it("never renders the real phone number for a candidate-tier entry even if one leaked through", () => {
    // Defense-in-depth: even if the caller mistakenly passed a real phone
    // number for a candidate-tier entry, the component's own domain-rule
    // check refuses to render it (tenant-directory: Contact Reveal Gated by
    // Acceptance).
    render(
      <CandidateCard
        tier="candidate"
        tenantName={null}
        contactPhone="+52 55 9999 0000"
        reputation={REPUTATION}
      />,
    );

    expect(screen.queryByText("+52 55 9999 0000")).not.toBeInTheDocument();
    expect(screen.getByTestId("candidate-contact-masked")).toBeInTheDocument();
  });

  it("renders the real Phase 7 reputation score additively alongside the raw counts", () => {
    render(
      <CandidateCard
        tier="connected"
        tenantName="Acme Motors"
        contactPhone="+52 55 1234 5678"
        reputation={REPUTATION}
      />,
    );

    const badge = screen.getByTestId("reputation-badge-score");
    expect(badge).toHaveAttribute("data-score", "90");
  });

  it("renders the unrated state for a candidate with zero terminal events yet", () => {
    render(
      <CandidateCard
        tier="candidate"
        tenantName={null}
        contactPhone={null}
        reputation={UNRATED_REPUTATION}
      />,
    );

    expect(screen.getByTestId("reputation-badge-unrated")).toBeInTheDocument();
    expect(screen.queryByTestId("reputation-badge-score")).not.toBeInTheDocument();
  });
});
