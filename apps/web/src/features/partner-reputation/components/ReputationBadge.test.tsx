import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ReputationBadge } from "./ReputationBadge";

describe("ReputationBadge", () => {
  it("renders the unrated state when score is null", () => {
    render(<ReputationBadge score={null} sampleSize={0} />);

    expect(screen.getByTestId("reputation-badge-unrated")).toBeInTheDocument();
    expect(screen.queryByTestId("reputation-badge-score")).not.toBeInTheDocument();
  });

  it("renders the computed score with its data-score attribute", () => {
    render(<ReputationBadge score={87.5} sampleSize={3} />);

    const badge = screen.getByTestId("reputation-badge-score");
    expect(badge).toHaveAttribute("data-score", "87.5");
    expect(badge).toHaveTextContent("3");
  });
});
