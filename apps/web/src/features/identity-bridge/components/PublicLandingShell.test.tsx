import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PublicLandingShell } from "./PublicLandingShell";

// PublicLandingShell now only ever renders on the marketing/root host (see
// routes/__root.tsx and shared/lib/host-mode.ts), and its "Iniciar sesión"
// CTAs are cross-origin <a> links into the app host's /login built via
// getAppOrigin() -- not TanStack Router's <Link>, so no router context is
// needed here, unlike the old IdentityGate-fallback version of this test.
const originalLocation = window.location;

function setLocation(url: string) {
  Object.defineProperty(window, "location", {
    configurable: true,
    value: new URL(url),
  });
}

afterEach(() => {
  Object.defineProperty(window, "location", {
    configurable: true,
    value: originalLocation,
  });
});

describe("PublicLandingShell", () => {
  it("points every 'Iniciar sesión' CTA at the app host's /login, preserving protocol and port", () => {
    setLocation("http://localhost:5173/");

    render(<PublicLandingShell />);

    const signInLinks = screen.getAllByRole("link", { name: /iniciar sesión/i });
    expect(signInLinks.length).toBeGreaterThanOrEqual(3);
    for (const link of signInLinks) {
      expect(link).toHaveAttribute("href", "http://app.localhost:5173/login");
    }
  });

  it("recomputes the login origin for a production-looking domain", () => {
    setLocation("https://redaliados.com/");

    render(<PublicLandingShell />);

    const [firstLink] = screen.getAllByRole("link", { name: /iniciar sesión/i });
    expect(firstLink).toHaveAttribute("href", "https://app.redaliados.com/login");
  });

  it("never advertises self-registration or an open catalog", () => {
    setLocation("http://localhost:5173/");

    render(<PublicLandingShell />);

    expect(screen.queryByText(/crear cuenta/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/registrate/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/explorar vehículos/i)).not.toBeInTheDocument();
  });
});
