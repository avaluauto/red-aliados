import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { renderWithRouter } from "../../../test/render-with-router";
import { SessionUnavailableState } from "./SessionUnavailableState";

// SessionUnavailableState renders PublicLandingShell, which now links to a
// dedicated /login route (see routes/login.tsx) via TanStack Router's
// <Link>, instead of toggling an inline sign-in panel. <Link> needs a real
// router context to render -- see ../../../test/render-with-router.tsx.
describe("SessionUnavailableState", () => {
  it("does not show the old 'no active session' status message anywhere", async () => {
    await renderWithRouter(<SessionUnavailableState />);

    expect(screen.queryByText(/sesión activa/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("links the header sign-in button to the dedicated /login page and navigates there on click", async () => {
    const user = userEvent.setup();
    const { router } = await renderWithRouter(<SessionUnavailableState />, {
      loginContent: <p>Página de inicio de sesión</p>,
    });

    const signInLinks = screen.getAllByRole("link", { name: /iniciar sesión/i });
    expect(signInLinks.length).toBeGreaterThan(0);
    for (const link of signInLinks) {
      expect(link).toHaveAttribute("href", "/login");
    }

    const [firstSignInLink] = signInLinks;
    if (!firstSignInLink) {
      throw new Error("Expected at least one sign-in link to be rendered");
    }
    await user.click(firstSignInLink);

    await waitFor(() => expect(router.state.location.pathname).toBe("/login"));
    expect(await screen.findByText(/página de inicio de sesión/i)).toBeInTheDocument();
  });

  it("never advertises self-registration or an open catalog", async () => {
    await renderWithRouter(<SessionUnavailableState />);

    expect(screen.queryByText(/crear cuenta/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/registrate/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/únete a la red/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/explorar vehículos/i)).not.toBeInTheDocument();
  });

  it("never shows a 'Comunidad' or 'Catálogo' nav link", async () => {
    await renderWithRouter(<SessionUnavailableState />);

    expect(screen.queryByText(/comunidad/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/catálogo/i)).not.toBeInTheDocument();
  });
});
