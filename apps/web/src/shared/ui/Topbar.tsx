// Shared authenticated-app topbar: brand mark + primary nav + sign-out.
// Extracted once a third authenticated route (routes/red.tsx) needed the
// exact same shell routes/index.tsx and routes/solicitudes.tsx already
// duplicated -- same brand mark, same nav links, same sign-out button, same
// Tailwind tokens. Presentational only: sign-out still calls
// supabaseClient.auth.signOut() the same way every route already did --
// IdentityGate re-derives session state on its own via onAuthStateChange
// (see routes/index.tsx's original comment on this), so no navigation is
// wired here either.
import { Link } from "@tanstack/react-router";
import { supabaseClient } from "@/features/identity-bridge";

async function handleSignOut() {
  await supabaseClient.auth.signOut();
}

export function Topbar() {
  return (
    <header className="border-b border-border bg-white">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-4">
        <div className="flex items-center gap-2.5">
          <span
            aria-hidden="true"
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary font-head text-sm font-bold text-white"
          >
            A
          </span>
          <span className="font-head text-lg font-bold text-dark">Avaluauto</span>
          <span className="text-sm font-medium text-muted">Red Aliados</span>
        </div>
        <nav className="flex items-center gap-4">
          <Link
            to="/"
            className="text-sm font-semibold text-dark transition-colors hover:text-primary"
          >
            Mi inventario
          </Link>
          <Link
            to="/solicitudes"
            className="text-sm font-semibold text-dark transition-colors hover:text-primary"
          >
            Conseguir
          </Link>
          <Link
            to="/red"
            className="text-sm font-semibold text-dark transition-colors hover:text-primary"
          >
            Tu red
          </Link>
          <Link
            to="/mensajes"
            className="text-sm font-semibold text-dark transition-colors hover:text-primary"
          >
            Mensajes
          </Link>
          <Link
            to="/perfil"
            className="text-sm font-semibold text-dark transition-colors hover:text-primary"
          >
            Perfil
          </Link>
          <button
            type="button"
            data-testid="sign-out-button"
            onClick={handleSignOut}
            className="rounded-full border border-border-2 bg-white px-5 py-2.5 text-sm font-semibold text-dark shadow-sm transition-colors hover:border-primary hover:text-primary"
          >
            Cerrar sesión
          </button>
        </nav>
      </div>
    </header>
  );
}
