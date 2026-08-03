import { createFileRoute } from "@tanstack/react-router";
import type { OwnTenantVehicle } from "@/features/vehicle-sync";
import { useOwnTenantVehicles } from "@/features/vehicle-sync";
import { Topbar } from "@/shared/ui/Topbar";

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
