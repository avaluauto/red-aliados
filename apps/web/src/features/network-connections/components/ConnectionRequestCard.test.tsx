import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ConnectionRequestCard } from "./ConnectionRequestCard";

describe("ConnectionRequestCard", () => {
  it("shows an Engage action for a suggested request viewed by its recipient", async () => {
    const onActOnSuggestion = vi.fn();
    const user = userEvent.setup();

    render(
      <ConnectionRequestCard
        status="suggested"
        viewerRole="recipient"
        onActOnSuggestion={onActOnSuggestion}
      />,
    );

    expect(screen.getByTestId("connection-request-status")).toHaveTextContent("suggested");
    const engageButton = screen.getByTestId("connection-request-engage-button");
    await user.click(engageButton);

    expect(onActOnSuggestion).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("connection-request-accept-button")).not.toBeInTheDocument();
    expect(screen.queryByTestId("connection-request-reject-button")).not.toBeInTheDocument();
  });

  it("shows Accept and Reject actions for a pending request viewed by its recipient", async () => {
    const onAccept = vi.fn();
    const onReject = vi.fn();
    const user = userEvent.setup();

    render(
      <ConnectionRequestCard
        status="pending"
        viewerRole="recipient"
        onAccept={onAccept}
        onReject={onReject}
      />,
    );

    await user.click(screen.getByTestId("connection-request-accept-button"));
    await user.click(screen.getByTestId("connection-request-reject-button"));

    expect(onAccept).toHaveBeenCalledTimes(1);
    expect(onReject).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("connection-request-engage-button")).not.toBeInTheDocument();
  });

  it("shows no action controls at all for the requester side of a pending request", () => {
    render(<ConnectionRequestCard status="pending" viewerRole="requester" />);

    expect(screen.getByTestId("connection-request-status")).toHaveTextContent("pending");
    expect(screen.queryByTestId("connection-request-accept-button")).not.toBeInTheDocument();
    expect(screen.queryByTestId("connection-request-reject-button")).not.toBeInTheDocument();
    expect(screen.queryByTestId("connection-request-engage-button")).not.toBeInTheDocument();
  });

  it("disables every action while a mutation is in flight", () => {
    render(
      <ConnectionRequestCard
        status="pending"
        viewerRole="recipient"
        isBusy
        onAccept={vi.fn()}
        onReject={vi.fn()}
      />,
    );

    expect(screen.getByTestId("connection-request-accept-button")).toBeDisabled();
    expect(screen.getByTestId("connection-request-reject-button")).toBeDisabled();
  });

  it("renders a terminal 'accepted' status with no action controls and shows both reciprocal edges", () => {
    render(<ConnectionRequestCard status="accepted" viewerRole="recipient" edgesCreated={2} />);

    expect(screen.getByTestId("connection-request-status")).toHaveTextContent("accepted");
    expect(screen.getByTestId("connection-request-edges-count")).toHaveTextContent("2");
    expect(screen.queryByTestId("connection-request-accept-button")).not.toBeInTheDocument();
    expect(screen.queryByTestId("connection-request-reject-button")).not.toBeInTheDocument();
  });

  it("renders a terminal 'rejected' status with zero edges and no action controls", () => {
    render(<ConnectionRequestCard status="rejected" viewerRole="recipient" edgesCreated={0} />);

    expect(screen.getByTestId("connection-request-status")).toHaveTextContent("rejected");
    expect(screen.getByTestId("connection-request-edges-count")).toHaveTextContent("0");
  });

  it("renders a terminal 'expired' status with zero edges and no action controls", () => {
    render(<ConnectionRequestCard status="expired" viewerRole="recipient" edgesCreated={0} />);

    expect(screen.getByTestId("connection-request-status")).toHaveTextContent("expired");
    expect(screen.getByTestId("connection-request-edges-count")).toHaveTextContent("0");
    expect(screen.queryByTestId("connection-request-engage-button")).not.toBeInTheDocument();
  });
});
