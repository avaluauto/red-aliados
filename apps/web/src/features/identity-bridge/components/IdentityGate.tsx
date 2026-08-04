// Container: wires the identity-bridge hook + domain rule to the app shell.
// No branch here ever renders a self-registration form -- V2 remains the
// only place a REAL session is created (spec: Federated JWT Trust). The
// session-unavailable branch does render a sign-in FORM (see
// SessionUnavailableState.tsx -> SignInForm.tsx), but that's a documented
// test-only stand-in against Red Aliados' own Supabase project, not
// self-registration and not real Avaluauto V2 identity verification.
import type { ReactNode } from "react";
import { isModuleEnabled } from "../domain/session-claims";
import { useSessionClaims } from "../hooks/useSessionClaims";
import { ModuleDisabledState } from "./ModuleDisabledState";
import { SessionLoadingState } from "./SessionLoadingState";
import { SessionUnavailableState } from "./SessionUnavailableState";

export type IdentityGateProps = {
  readonly children: ReactNode;
};

export function IdentityGate({ children }: IdentityGateProps) {
  const { data, isPending } = useSessionClaims();

  if (isPending || !data) {
    return <SessionLoadingState />;
  }

  if (data.status === "unauthenticated") {
    return <SessionUnavailableState />;
  }

  if (!isModuleEnabled(data.claims)) {
    return <ModuleDisabledState />;
  }

  return <>{children}</>;
}
