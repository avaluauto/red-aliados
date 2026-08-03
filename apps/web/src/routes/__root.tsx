import { createRootRoute, Outlet, useRouterState } from "@tanstack/react-router";
import { IdentityGate } from "@/features/identity-bridge";

export const Route = createRootRoute({
  component: RootLayout,
});

// /login must be reachable with NO session -- it's the page that creates
// one. IdentityGate's unauthenticated fallback (PublicLandingShell) would
// otherwise intercept every route, including /login itself, making it
// impossible to ever reach the sign-in form. Every other route stays gated.
function RootLayout() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const isLoginRoute = pathname === "/login";

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
