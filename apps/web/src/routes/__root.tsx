import { createRootRoute, Outlet } from "@tanstack/react-router";
import { IdentityGate } from "@/features/identity-bridge";

export const Route = createRootRoute({
  component: RootLayout,
});

function RootLayout() {
  return (
    <div className="min-h-screen bg-white text-slate-900">
      <IdentityGate>
        <Outlet />
      </IdentityGate>
    </div>
  );
}
