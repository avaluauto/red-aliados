import { type FormEvent, useId, useState } from "react";
import { useSignIn } from "../hooks/useSignIn";

// A real sign-in form -- email + password, submitting via
// `supabaseClient.auth.signInWithPassword` (see ../hooks/useSignIn.ts ->
// ../data/sign-in.ts). This is SIGN-IN ONLY: there is no self-registration
// here and there never will be (openspec/changes/red-aliados-core-mvp/
// proposal.md's Out of Scope explicitly forbids self-registration) -- do not
// add a "create account"/"registrate" link. There is also no password-reset
// flow here (out of scope, not requested).
//
// IMPORTANT stand-in note (mirrors SessionUnavailableState.tsx/
// IdentityGate.tsx's doc-comment style): submitting this form currently
// authenticates against Red Aliados' OWN (test-only) Supabase project, via
// the Custom Access Token Hook stand-in documented in
// supabase/LOCAL_TESTING.md -- it is NOT real identity verification against
// Avaluauto today. The real integration is Avaluauto V2 (identity-bridge:
// Federated JWT Trust, supabase/THIRD_PARTY_AUTH.md), which has not been
// coordinated/configured yet. Whatever mechanism V2 ends up exposing
// (JWKS-based Third-Party Auth, or something else) is what will actually
// verify a user "comes from Avaluauto" -- this form's own UI/UX can likely
// stay the same, only what happens on submit (../data/sign-in.ts) may need
// to change.
export type SignInFormProps = {
  readonly onSuccess?: () => void;
};

export function SignInForm({ onSuccess }: SignInFormProps) {
  const emailId = useId();
  const passwordId = useId();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const signIn = useSignIn();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    signIn.mutate(
      { email, password },
      {
        onSuccess: () => onSuccess?.(),
      },
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-3">
      <div className="flex flex-col gap-1 text-left">
        <label htmlFor={emailId} className="text-sm font-medium text-slate-700">
          Email
        </label>
        <input
          id={emailId}
          name="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
      </div>
      <div className="flex flex-col gap-1 text-left">
        <label htmlFor={passwordId} className="text-sm font-medium text-slate-700">
          Contraseña
        </label>
        <input
          id={passwordId}
          name="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
      </div>

      {signIn.isError && (
        <p role="alert" className="text-sm text-red-600">
          No pudimos iniciar sesión. Revisá tu email y contraseña e intentá de nuevo.
        </p>
      )}

      <button
        type="submit"
        disabled={signIn.isPending}
        className="mt-1 rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {signIn.isPending ? "Ingresando…" : "Iniciar sesión"}
      </button>
    </form>
  );
}
