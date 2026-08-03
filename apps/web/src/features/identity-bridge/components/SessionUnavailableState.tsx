import { PublicLandingShell } from "./PublicLandingShell";

// Shown when there is no valid session at all (no session, or a JWT that
// failed claim-contract validation -- spec: Invalid or tampered JWT
// rejected). Never a self-registration form: V2 remains the only place a
// REAL session is created. Renders PublicLandingShell as-is; its header
// "Iniciar sesión" link now navigates to the dedicated /login route
// (routes/login.tsx) instead of revealing an inline panel -- see
// SignInForm.tsx for what that form actually authenticates against today (a
// documented test-only stand-in, not real Avaluauto V2 identity
// verification) and why that's not the same thing as self-registration.
export function SessionUnavailableState() {
  return <PublicLandingShell />;
}
