import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SessionUnavailableState } from "./SessionUnavailableState";

describe("SessionUnavailableState", () => {
  it("shows a no-active-session message", () => {
    render(<SessionUnavailableState />);

    expect(screen.getByRole("status")).toHaveTextContent(/no active/i);
  });

  it("never renders a registration or login form", () => {
    render(<SessionUnavailableState />);

    expect(screen.queryByRole("form")).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
