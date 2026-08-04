import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { RequestConnectionButton } from "./RequestConnectionButton";

describe("RequestConnectionButton", () => {
  it("fires onRequest when clicked", async () => {
    const onRequest = vi.fn();
    const user = userEvent.setup();

    render(<RequestConnectionButton onRequest={onRequest} />);

    await user.click(screen.getByTestId("request-connection-button"));

    expect(onRequest).toHaveBeenCalledTimes(1);
  });

  it("is disabled while a request is already in flight", () => {
    render(<RequestConnectionButton onRequest={vi.fn()} isBusy />);

    expect(screen.getByTestId("request-connection-button")).toBeDisabled();
  });

  it("renders nothing once a candidate link already exists -- no duplicate request path", () => {
    const { container } = render(<RequestConnectionButton onRequest={vi.fn()} alreadyRequested />);

    expect(container).toBeEmptyDOMElement();
  });
});
