import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { SignInForm } from "@/features/identity-bridge";

// Dedicated sign-in PAGE (not a modal/dropdown) -- reuses SignInForm as-is
// (see identity-bridge/components/SignInForm.tsx for what it actually
// authenticates against today). On success, redirects back to "/" via
// useNavigate; SignInForm itself has no notion of routing, it just calls
// the onSuccess callback we pass it.
export const Route = createFileRoute("/login")({
  component: LoginPage,
});

export function LoginPage() {
  const navigate = useNavigate();

  return (
    <main className="flex min-h-screen items-center justify-center bg-[image:var(--brand-grad)] px-6 py-12">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-lg">
        <div className="flex flex-col items-center gap-1 text-center">
          <span className="font-head text-lg font-bold text-dark">Avaluauto</span>
          <span className="text-sm font-medium text-primary">Red Aliados</span>
        </div>
        <h1 className="mt-6 text-center font-head text-2xl font-bold text-dark">Iniciar sesión</h1>
        <p className="mt-1 text-center text-sm text-body">
          Ingresá con tu cuenta de Avaluauto para acceder a Red Aliados.
        </p>
        <div className="mt-6">
          <SignInForm onSuccess={() => navigate({ to: "/" })} />
        </div>
      </div>
    </main>
  );
}
