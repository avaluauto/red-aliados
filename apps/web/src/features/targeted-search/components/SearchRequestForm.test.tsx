import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SearchRequestForm } from "./SearchRequestForm";

describe("SearchRequestForm", () => {
  it("submits the entered make/model criteria", async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();

    render(<SearchRequestForm onSubmit={onSubmit} />);

    await user.type(screen.getByTestId("search-request-make-input"), "Toyota");
    await user.type(screen.getByTestId("search-request-model-input"), "Corolla");
    await user.click(screen.getByTestId("search-request-submit-button"));

    expect(onSubmit).toHaveBeenCalledWith({ make: "Toyota", model: "Corolla" });
  });

  it("does not submit without a make", async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();

    render(<SearchRequestForm onSubmit={onSubmit} />);

    expect(screen.getByTestId("search-request-submit-button")).toBeDisabled();
    await user.type(screen.getByTestId("search-request-model-input"), "Corolla");
    expect(screen.getByTestId("search-request-submit-button")).toBeDisabled();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("disables the form while submitting", () => {
    render(<SearchRequestForm isSubmitting onSubmit={vi.fn()} />);

    expect(screen.getByTestId("search-request-make-input")).toBeDisabled();
    expect(screen.getByTestId("search-request-model-input")).toBeDisabled();
    expect(screen.getByTestId("search-request-submit-button")).toBeDisabled();
  });
});
