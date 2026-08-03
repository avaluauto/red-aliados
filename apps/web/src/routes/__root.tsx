import { createRootRoute, Outlet, useRouterState } from "@tanstack/react-router";
import { IdentityGate, PublicLandingShell } from "@/features/identity-bridge";
import { isAppHost } from "@/shared/lib/host-mode";

export const Route = createRootRoute({
  component: RootLayout,
});

// Hostname split (single build, see shared/lib/host-mode.ts): the
// marketing/root host (hostname does NOT start with "app.") always renders
// PublicLandingShell, for every path -- that domain has effectively one
// page and never routes anywhere else. The app host ("app." subdomain)
// keeps the previous IdentityGate-gated routing below unchanged.
//
// /login must be reachable with NO session -- it's the page that creates
// one. IdentityGate's unauthenticated fallback would otherwise intercept
// every route, including /login itself, making it impossible to ever reach
// the sign-in form. Every other route stays gated.
function RootLayout() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const isLoginRoute = pathname === "/login";

  if (!isAppHost()) {
    return (
      <div className="min-h-screen bg-white text-slate-900">
        <PublicLandingShell />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white text-slate-900">
      {isLoginRoute ? (
        <Outlet />
      ) : (
        <IdentityGate>
          <Outlet />
        </IdentityGate>
      )}
    </div>
  );
}
