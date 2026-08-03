import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderWithRouter } from "../../../test/render-with-router";
import { SessionUnavailableState } from "./SessionUnavailableState";

// SessionUnavailableState now redirects to /login the moment it renders
// (see its own doc comment) instead of rendering PublicLandingShell -- that
// marketing page now lives only on the root host (routes/__root.tsx). Both
// the programmatic useNavigate redirect and the same-origin <Link> fallback
// need a real router context -- see ../../../test/render-with-router.tsx.
describe("SessionUnavailableState", () => {
  it("redirects to /login as soon as it renders", async () => {
    const { router } = await renderWithRouter(<SessionUnavailableState />, {
      loginContent: <p>Página de inicio de sesión</p>,
    });

    await waitFor(() => expect(router.state.location.pathname).toBe("/login"));
    expect(await screen.findByText(/página de inicio de sesión/i)).toBeInTheDocument();
  });

  it("shows a fallback message and a same-origin link to /login", async () => {
    await renderWithRouter(<SessionUnavailableState />);

    const loginLink = screen.getByRole("link", { name: /iniciar sesión/i });
    expect(loginLink).toHaveAttribute("href", "/login");
  });

  it("never renders marketing/landing content", async () => {
    await renderWithRouter(<SessionUnavailableState />);

    expect(screen.queryByText(/red donde los concesionarios/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/cómo funciona/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/crear cuenta/i)).not.toBeInTheDocument();
  });
});
