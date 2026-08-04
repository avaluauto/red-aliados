import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

// Shown when there is no valid session at all (no session, or a JWT that
// failed claim-contract validation -- spec: Invalid or tampered JWT
// rejected). This only ever renders on the app host now (routes/__root.tsx
// renders PublicLandingShell directly for the marketing/root host branch --
// see shared/lib/host-mode.ts -- so IdentityGate itself only ever mounts on
// the app host). It no longer owns "the public marketing experience": an
// unauthenticated visitor to the app host should land on the real /login
// page, not a marketing pitch, so this redirects there via useNavigate the
// moment it renders, with a brief visible message + a same-origin <Link>
// fallback in case the programmatic redirect doesn't fire instantly. Never
// a self-registration form: V2 remains the only place a REAL session is
// created. See SignInForm.tsx for what /login actually authenticates
// against today (a documented test-only stand-in, not real Avaluauto V2
// identity verification).
export function SessionUnavailableState() {
  const navigate = useNavigate();

  useEffect(() => {
    navigate({ to: "/login" });
  }, [navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-white px-6 text-center">
      <div>
        <p className="text-sm text-body">Redirigiendo a la página de inicio de sesión...</p>
        <Link to="/login" className="mt-2 inline-block text-sm font-semibold text-primary">
          Iniciar sesión
        </Link>
      </div>
    </div>
  );
}
