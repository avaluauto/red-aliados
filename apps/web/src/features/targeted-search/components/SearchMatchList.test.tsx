import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SearchMatchList } from "./SearchMatchList";

const OWN_MATCH = {
  id: "v1",
  source: "own_inventory" as const,
  vehicleSnapshotId: "v1",
  make: "Toyota",
  model: "Corolla",
  year: 2020,
  matchOwnerTenantId: "11111111-1111-4111-8111-111111111111",
};

const NETWORK_MATCH = {
  id: "cr1",
  source: "network" as const,
  vehicleSnapshotId: "v2",
  make: "Honda",
  model: "Civic",
  year: 2019,
  matchOwnerTenantId: "22222222-2222-4222-8222-222222222222",
  connectionRequestId: "cr1",
};

describe("SearchMatchList", () => {
  it("renders matches in the order given, tagged with their source", () => {
    render(
      <SearchMatchList
        matches={[OWN_MATCH, NETWORK_MATCH]}
        fanOutEnabled={true}
        onOptInFanOut={vi.fn()}
        onProceed={vi.fn()}
      />,
    );

    const items = screen.getAllByTestId("search-match-item");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveAttribute("data-source", "own_inventory");
    expect(items[1]).toHaveAttribute("data-source", "network");
  });

  it("shows the opt-in fan-out prompt when fan-out is not yet enabled, and never renders network matches", () => {
    render(
      <SearchMatchList
        matches={[OWN_MATCH]}
        fanOutEnabled={false}
        onOptInFanOut={vi.fn()}
        onProceed={vi.fn()}
      />,
    );

    expect(screen.getByTestId("search-match-optin-button")).toBeInTheDocument();
  });

  it("calls onOptInFanOut when the opt-in prompt is used", async () => {
    const onOptInFanOut = vi.fn();
    const user = userEvent.setup();

    render(
      <SearchMatchList
        matches={[]}
        fanOutEnabled={false}
        onOptInFanOut={onOptInFanOut}
        onProceed={vi.fn()}
      />,
    );

    await user.click(screen.getByTestId("search-match-optin-button"));
    expect(onOptInFanOut).toHaveBeenCalledTimes(1);
  });

  // No Auto-Share; Explicit Proceed Fires Opportunity Event (targeted-search
  // spec): "GIVEN a fan-out search returns a match WHEN the requester merely
  // views the match THEN no data has been shared ... and no Opportunity
  // exists yet." A match arrives already visible (details are NOT masked --
  // there is no reveal-on-accept gate here, unlike tenant-directory's
  // contact masking), but Proceed must stay disabled/inert until the
  // requester explicitly views it -- purely a client-side view gate
  // (domain/match-view-gate.ts), no network call fired by viewing.
  it("keeps Proceed disabled for a match until the requester explicitly views it, and viewing fires no callback at all", async () => {
    const onProceed = vi.fn();
    const user = userEvent.setup();

    render(
      <SearchMatchList
        matches={[NETWORK_MATCH]}
        fanOutEnabled={true}
        onOptInFanOut={vi.fn()}
        onProceed={onProceed}
      />,
    );

    const proceedButton = screen.getByTestId("search-match-proceed-button");
    expect(proceedButton).toBeDisabled();

    await user.click(screen.getByTestId("search-match-view-button"));

    expect(onProceed).not.toHaveBeenCalled();
    expect(screen.getByTestId("search-match-proceed-button")).toBeEnabled();
  });

  it("calls onProceed with the match's identifying ids once clicked after viewing", async () => {
    const onProceed = vi.fn();
    const user = userEvent.setup();

    render(
      <SearchMatchList
        matches={[NETWORK_MATCH]}
        fanOutEnabled={true}
        onOptInFanOut={vi.fn()}
        onProceed={onProceed}
      />,
    );

    await user.click(screen.getByTestId("search-match-view-button"));
    await user.click(screen.getByTestId("search-match-proceed-button"));

    expect(onProceed).toHaveBeenCalledWith(NETWORK_MATCH);
  });

  it("an own_inventory match never shows a view gate or Proceed control -- proceeding is only meaningful for network matches", () => {
    render(
      <SearchMatchList
        matches={[OWN_MATCH]}
        fanOutEnabled={true}
        onOptInFanOut={vi.fn()}
        onProceed={vi.fn()}
      />,
    );

    expect(screen.queryByTestId("search-match-view-button")).not.toBeInTheDocument();
    expect(screen.queryByTestId("search-match-proceed-button")).not.toBeInTheDocument();
  });

  it("renders nothing extra when there are zero matches and fan-out is already enabled", () => {
    render(
      <SearchMatchList
        matches={[]}
        fanOutEnabled={true}
        onOptInFanOut={vi.fn()}
        onProceed={vi.fn()}
      />,
    );

    expect(screen.queryByTestId("search-match-item")).not.toBeInTheDocument();
    expect(screen.queryByTestId("search-match-optin-button")).not.toBeInTheDocument();
  });
});
