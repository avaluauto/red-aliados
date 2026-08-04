import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderWithRouter } from "../test/render-with-router";
import { LoginPage } from "./login";

// Smoke test only -- LoginPage is presentational, it reuses SignInForm as-is
// (SignInForm's own behavior is covered by
// features/identity-bridge/components/SignInForm.test.tsx).
describe("LoginPage", () => {
  it("shows the sign-in form (email + password)", async () => {
    await renderWithRouter(<LoginPage />);

    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/contraseña/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^iniciar sesión$/i })).toBeInTheDocument();
  });

  it("never renders sign-up/self-registration content", async () => {
    await renderWithRouter(<LoginPage />);

    expect(screen.queryByText(/crear cuenta/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/registrate/i)).not.toBeInTheDocument();
  });
});
