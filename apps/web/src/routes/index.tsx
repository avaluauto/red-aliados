import { createFileRoute } from "@tanstack/react-router";
import { supabaseClient } from "@/features/identity-bridge";
import type { OwnTenantVehicle } from "@/features/vehicle-sync";
import { useOwnTenantVehicles } from "@/features/vehicle-sync";

export const Route = createFileRoute("/")({
  component: HomePage,
});

const CURRENCY_FORMATTER = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

function formatPrice(value: number | null): string {
  return value === null ? "Sin definir" : CURRENCY_FORMATTER.format(value);
}

async function handleSignOut() {
  await supabaseClient.auth.signOut();
  // IdentityGate re-derives session state via onAuthStateChange (already
  // wired in identity-bridge), so no manual navigation is needed here -- it
  // swaps back to the public landing page on its own once the session clears.
}

function Topbar() {
  return (
    <header className="border-b border-border bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-4">
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
        <button
          type="button"
          data-testid="sign-out-button"
          onClick={handleSignOut}
          className="rounded-full border border-border-2 bg-white px-5 py-2.5 text-sm font-semibold text-dark shadow-sm transition-colors hover:border-primary hover:text-primary"
        >
          Cerrar sesión
        </button>
      </div>
    </header>
  );
}

function VehicleCard({ vehicle }: { readonly vehicle: OwnTenantVehicle }) {
  return (
    <article
      data-testid="vehicle-card"
      className="flex flex-col gap-3 rounded-xl border border-border bg-white p-5 shadow-sm"
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-head text-base font-semibold text-dark">
          {vehicle.make} {vehicle.model} {vehicle.year ?? ""}
        </h3>
        <span className="rounded-full bg-tint px-3 py-1 text-xs font-semibold uppercase tracking-wide text-primary">
          {vehicle.status}
        </span>
      </div>
      <dl className="flex flex-col gap-1 text-sm">
        <div className="flex items-center justify-between">
          <dt className="text-muted">Precio aliado</dt>
          <dd className="font-semibold text-dark">{formatPrice(vehicle.allyPrice)}</dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="text-muted">Precio mínimo</dt>
          <dd className="font-semibold text-dark">{formatPrice(vehicle.minPrice)}</dd>
        </div>
      </dl>
      <p className="text-xs text-faint">{vehicle.viewsCount} vistas</p>
    </article>
  );
}

export function HomePage() {
  const { data: vehicles, isPending } = useOwnTenantVehicles();

  return (
    <div className="min-h-screen bg-bg">
      <Topbar />
      <main className="mx-auto max-w-6xl px-6 py-10">
        <h1 className="font-head text-2xl font-bold text-dark">Mi inventario</h1>
        <p className="mt-1 text-sm text-body">Los vehículos que sincronizás desde Avaluauto.</p>

        <div className="mt-8">
          {isPending ? (
            <p data-testid="vehicles-loading" className="text-sm text-muted">
              Cargando…
            </p>
          ) : vehicles && vehicles.length > 0 ? (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {vehicles.map((vehicle) => (
                <VehicleCard key={vehicle.id} vehicle={vehicle} />
              ))}
            </div>
          ) : (
            <p data-testid="vehicles-empty" className="text-sm text-muted">
              Todavía no tenés vehículos sincronizados.
            </p>
          )}
        </div>
      </main>
    </div>
  );
}
