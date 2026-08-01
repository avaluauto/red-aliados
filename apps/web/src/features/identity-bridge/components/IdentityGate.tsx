// Container: wires the identity-bridge hook + domain rule to the app shell.
// No branch here ever renders a registration/login form -- V2 is the only
// place a session is created (spec: Federated JWT Trust).
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
