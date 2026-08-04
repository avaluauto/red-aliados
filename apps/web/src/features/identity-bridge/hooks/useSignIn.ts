// Wires the sign-in data adapter behind a TanStack Query mutation, per
// design.md's hexagonal-lite split (mirrors useSessionClaims.ts on the read
// side). Components never talk to ../data directly.
import { useMutation } from "@tanstack/react-query";
import { signInWithPassword } from "../data/sign-in";

/** Email/password sign-in mutation. See SignInForm.tsx for the test-only-stand-in note. */
export function useSignIn() {
  return useMutation({
    mutationFn: signInWithPassword,
  });
}
