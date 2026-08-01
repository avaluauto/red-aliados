// Wires domain (claim validation) + data (Supabase session read) together
// behind a single TanStack Query hook, per design.md's hexagonal-lite split.
// Components never talk to ../data or ../domain directly.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { fetchSessionResult, subscribeToAuthChanges } from "../data/session";
import { parseSessionClaims, type SessionClaims } from "../domain/session-claims";

export const sessionClaimsQueryKey = ["identity-bridge", "session-claims"] as const;

export type SessionState =
  | { readonly status: "authenticated"; readonly claims: SessionClaims }
  | { readonly status: "unauthenticated" };

async function loadSessionState(): Promise<SessionState> {
  const result = await fetchSessionResult();

  if (result.status === "unauthenticated") {
    return { status: "unauthenticated" };
  }

  const parsed = parseSessionClaims(result.rawClaims);
  if (!parsed.valid) {
    // A claims-contract violation is treated the same as no session at all
    // (identity-bridge: Invalid or tampered JWT rejected).
    return { status: "unauthenticated" };
  }

  return { status: "authenticated", claims: parsed.claims };
}

/** Current session/claims, re-derived whenever Supabase's auth state changes. */
export function useSessionClaims() {
  const queryClient = useQueryClient();

  useEffect(() => {
    return subscribeToAuthChanges(() => {
      queryClient.invalidateQueries({ queryKey: sessionClaimsQueryKey });
    });
  }, [queryClient]);

  return useQuery({
    queryKey: sessionClaimsQueryKey,
    queryFn: loadSessionState,
    staleTime: 60_000,
  });
}
