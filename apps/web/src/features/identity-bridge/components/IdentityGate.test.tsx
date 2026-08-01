import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { SessionClaims } from "../domain/session-claims";
import { IdentityGate } from "./IdentityGate";

const useSessionClaims = vi.fn();

vi.mock("../hooks/useSessionClaims", () => ({
  useSessionClaims: () => useSessionClaims(),
}));

const ENABLED_CLAIMS: SessionClaims = {
  tenantId: "11111111-1111-4111-8111-111111111111",
  role: "dealer_admin",
  redAliadosEnabled: true,
};

const DISABLED_CLAIMS: SessionClaims = {
  tenantId: "11111111-1111-4111-8111-111111111111",
  role: "dealer_admin",
  redAliadosEnabled: false,
};

describe("IdentityGate", () => {
  it("renders children when authenticated and module-enabled", () => {
    useSessionClaims.mockReturnValue({
      isPending: false,
      data: { status: "authenticated", claims: ENABLED_CLAIMS },
    });

    render(
      <IdentityGate>
        <div>Protected content</div>
      </IdentityGate>,
    );

    expect(screen.getByText("Protected content")).toBeInTheDocument();
  });

  it("renders the module-disabled state when authenticated but disabled, and hides children", () => {
    useSessionClaims.mockReturnValue({
      isPending: false,
      data: { status: "authenticated", claims: DISABLED_CLAIMS },
    });

    render(
      <IdentityGate>
        <div>Protected content</div>
      </IdentityGate>,
    );

    expect(screen.getByRole("status")).toHaveTextContent(/isn't enabled/i);
    expect(screen.queryByText("Protected content")).not.toBeInTheDocument();
  });

  it("renders the session-unavailable state when unauthenticated, and hides children", () => {
    useSessionClaims.mockReturnValue({
      isPending: false,
      data: { status: "unauthenticated" },
    });

    render(
      <IdentityGate>
        <div>Protected content</div>
      </IdentityGate>,
    );

    expect(screen.getByRole("status")).toHaveTextContent(/no active/i);
    expect(screen.queryByText("Protected content")).not.toBeInTheDocument();
  });

  it("renders a loading state while pending, and hides children", () => {
    useSessionClaims.mockReturnValue({ isPending: true, data: undefined });

    render(
      <IdentityGate>
        <div>Protected content</div>
      </IdentityGate>,
    );

    expect(screen.queryByText("Protected content")).not.toBeInTheDocument();
  });
});
