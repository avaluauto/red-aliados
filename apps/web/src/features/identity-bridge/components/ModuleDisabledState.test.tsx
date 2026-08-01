import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ModuleDisabledState } from "./ModuleDisabledState";

describe("ModuleDisabledState", () => {
  it("shows a not-enabled message", () => {
    render(<ModuleDisabledState />);

    expect(screen.getByRole("status")).toHaveTextContent(/isn't enabled/i);
  });

  it("never renders a registration or login form", () => {
    render(<ModuleDisabledState />);

    expect(screen.queryByRole("form")).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
