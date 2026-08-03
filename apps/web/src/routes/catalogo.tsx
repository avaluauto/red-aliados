import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { type ChangeEvent, useMemo, useState } from "react";
import { supabaseClient, useSessionClaims } from "@/features/identity-bridge";
import { useCreateConnectionRequest } from "@/features/network-connections";
import { useVisibleVehicles, type VisibleVehicle } from "@/features/vehicle-sync";
import { Topbar } from "@/shared/ui/Topbar";

// "Catálogo" -- browses every vehicle currently visible to the caller's
// tenant across the WHOLE network (own inventory at `owner` tier, connected
// tenants' inventory at `connected` tier, candidate-tier rows with
// name/contact masked), unlike routes/index.tsx's stat cards/chart which
// only ever look at the caller's own inventory. Only composes the
// already-tested vehicle-sync/network-connections data/hooks layers -- no
// new query/mutation logic here beyond the pure client-side filter below.
export const Route = createFileRoute("/catalogo")({
  component: CatalogoPage,
});

const CURRENCY_FORMATTER = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

function formatPrice(value: number | null): string {
  return value === null ? "Sin definir" : CURRENCY_FORMATTER.format(value);
}

/**
 * SessionClaims (identity-bridge/domain/session-claims.ts) carries
 * tenantId/role/redAliadosEnabled but no user id -- creating a connection
 * request needs one for `requested_by`. Reads it straight from Supabase's
 * own auth user, same pattern routes/red.tsx and routes/solicitudes.tsx
 * already established for this exact gap.
 */
function useCurrentUserId() {
  return useQuery({
    queryKey: ["catalogo", "current-user-id"],
    queryFn: async () => {
      const { data, error } = await supabaseClient.auth.getUser();
      if (error || !data.user) {
        return null;
      }
      return data.user.id;
    },
  });
}

interface CatalogFilters {
  readonly search: string;
  readonly make: string;
  readonly yearMin: string;
  readonly yearMax: string;
  readonly priceMin: string;
  readonly priceMax: string;
}

const EMPTY_FILTERS: CatalogFilters = {
  search: "",
  make: "",
  yearMin: "",
  yearMax: "",
  priceMin: "",
  priceMax: "",
};

// Plain client-side filtering over the already-fetched result -- no
// natural-language parsing ("menos de 180 millones" style free text), that
// needs NLP/LLM integration this app doesn't have. Search is a plain
// substring match against make/model; range filters only apply to vehicles
// that actually have a value for that column (a null year/ally_price can't
// be verified against a range, so it's excluded rather than guessed at).
function filterVehicles(
  vehicles: readonly VisibleVehicle[],
  filters: CatalogFilters,
): VisibleVehicle[] {
  const search = filters.search.trim().toLowerCase();
  const yearMin = filters.yearMin.trim() === "" ? null : Number(filters.yearMin);
  const yearMax = filters.yearMax.trim() === "" ? null : Number(filters.yearMax);
  const priceMin = filters.priceMin.trim() === "" ? null : Number(filters.priceMin);
  const priceMax = filters.priceMax.trim() === "" ? null : Number(filters.priceMax);

  return vehicles.filter((vehicle) => {
    if (search && !`${vehicle.make} ${vehicle.model}`.toLowerCase().includes(search)) {
      return false;
    }
    if (filters.make && vehicle.make !== filters.make) {
      return false;
    }
    if (yearMin !== null || yearMax !== null) {
      if (vehicle.year === null) {
        return false;
      }
      if (yearMin !== null && vehicle.year < yearMin) {
        return false;
      }
      if (yearMax !== null && vehicle.year > yearMax) {
        return false;
      }
    }
    if (priceMin !== null || priceMax !== null) {
      if (vehicle.allyPrice === null) {
        return false;
      }
      if (priceMin !== null && vehicle.allyPrice < priceMin) {
        return false;
      }
      if (priceMax !== null && vehicle.allyPrice > priceMax) {
        return false;
      }
    }
    return true;
  });
}

interface VehicleCatalogCardProps {
  readonly vehicle: VisibleVehicle;
  readonly myTenantId: string | undefined;
  readonly currentUserId: string | null | undefined;
}

function VehicleCatalogCard({ vehicle, myTenantId, currentUserId }: VehicleCatalogCardProps) {
  const [requestSent, setRequestSent] = useState(false);
  const createInterest = useCreateConnectionRequest();

  // Requesting your own vehicle makes no sense (and requester_tenant_id ===
  // recipient_tenant_id would not be a coherent connection request, would
  // likely fail the insert_own_request RLS policy's provenance check
  // anyway) -- the button simply never renders for the caller's own rows.
  const isOwnVehicle = myTenantId !== undefined && vehicle.tenantId === myTenantId;

  function handleInterest() {
    if (!myTenantId || !currentUserId) {
      return;
    }
    createInterest.mutate(
      {
        requesterTenantId: myTenantId,
        recipientTenantId: vehicle.tenantId,
        originType: "vehicle_interest",
        requestedBy: currentUserId,
        vehicleSnapshotId: vehicle.id,
      },
      { onSuccess: () => setRequestSent(true) },
    );
  }

  return (
    <article
      data-testid="catalog-vehicle-card"
      className="flex flex-col overflow-hidden rounded-xl border border-border bg-white shadow-sm"
    >
      <div className="relative h-32 w-full bg-tint">
        <span className="absolute left-3 top-3 rounded-full bg-white/90 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-primary shadow-sm">
          Verificado
        </span>
      </div>
      <div className="flex flex-col gap-1 p-4">
        <h3 className="font-head text-base font-semibold text-dark">
          {vehicle.make} {vehicle.model}
        </h3>
        <p className="text-sm text-muted">{vehicle.year ?? "Año sin definir"}</p>
        <p data-testid="catalog-vehicle-owner" className="text-xs text-muted">
          {vehicle.tenantName ?? "Aliado"}
        </p>

        <div className="mt-2 flex items-center justify-between">
          <div className="flex flex-col">
            <span className="font-head text-lg font-bold text-dark">
              {formatPrice(vehicle.allyPrice)}
            </span>
            <span className="text-xs text-faint">Precio aliados</span>
          </div>
          <span className="rounded-full bg-tint px-2.5 py-1 text-[11px] font-semibold text-primary">
            {vehicle.viewsCount} vistas
          </span>
        </div>

        {vehicle.minPrice !== null ? (
          <p data-testid="catalog-vehicle-min-price" className="text-xs text-muted">
            Precio mínimo: {formatPrice(vehicle.minPrice)}
          </p>
        ) : null}

        {isOwnVehicle ? null : requestSent ? (
          <button
            type="button"
            disabled
            data-testid="catalog-interest-sent"
            className="mt-3 self-start rounded-full border border-border-2 bg-white px-4 py-2 text-xs font-semibold text-muted disabled:opacity-70"
          >
            Solicitud enviada
          </button>
        ) : (
          <button
            type="button"
            data-testid="catalog-interest-button"
            disabled={createInterest.isPending || !myTenantId || !currentUserId}
            onClick={handleInterest}
            className="mt-3 self-start rounded-full bg-primary px-4 py-2 text-xs font-semibold text-white transition-colors hover:opacity-90 disabled:opacity-50"
          >
            Me interesa
          </button>
        )}
      </div>
    </article>
  );
}

export function CatalogoPage() {
  const { data: session } = useSessionClaims();
  const myTenantId = session?.status === "authenticated" ? session.claims.tenantId : undefined;
  const { data: currentUserId } = useCurrentUserId();

  const { data: vehicles, isPending } = useVisibleVehicles();
  const vehicleList = useMemo(() => vehicles ?? [], [vehicles]);

  const [filters, setFilters] = useState<CatalogFilters>(EMPTY_FILTERS);

  const availableMakes = useMemo(
    () =>
      Array.from(new Set(vehicleList.map((vehicle) => vehicle.make))).sort((a, b) =>
        a.localeCompare(b),
      ),
    [vehicleList],
  );

  const filteredVehicles = useMemo(
    () => filterVehicles(vehicleList, filters),
    [vehicleList, filters],
  );

  function updateFilter<K extends keyof CatalogFilters>(field: K) {
    return (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      setFilters((current) => ({ ...current, [field]: event.target.value }));
    };
  }

  return (
    <div className="min-h-screen bg-bg">
      <Topbar />
      <main className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-10">
        <div>
          <h1 className="font-head text-2xl font-bold text-dark">Catálogo</h1>
          <p className="mt-1 text-sm text-body">
            Explorá los vehículos visibles en tu red y mostrá interés en el que te sirva.
          </p>
        </div>

        <section
          data-testid="catalog-filters"
          className="flex flex-col gap-4 rounded-xl border border-border bg-white p-5 shadow-sm"
        >
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-dark" htmlFor="catalog-search-input">
              Buscar
            </label>
            <input
              id="catalog-search-input"
              data-testid="catalog-search-input"
              type="text"
              placeholder="Buscar por marca o modelo…"
              value={filters.search}
              onChange={updateFilter("search")}
              className="rounded-lg border border-border-2 bg-white px-3 py-2 text-sm text-dark outline-none focus:border-primary"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-dark" htmlFor="catalog-make-select">
                Marca
              </label>
              <select
                id="catalog-make-select"
                data-testid="catalog-make-select"
                value={filters.make}
                onChange={updateFilter("make")}
                className="rounded-lg border border-border-2 bg-white px-3 py-2 text-sm text-dark outline-none focus:border-primary"
              >
                <option value="">Todas</option>
                {availableMakes.map((make) => (
                  <option key={make} value={make}>
                    {make}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-dark" htmlFor="catalog-year-min-input">
                Año mínimo
              </label>
              <input
                id="catalog-year-min-input"
                data-testid="catalog-year-min-input"
                type="number"
                value={filters.yearMin}
                onChange={updateFilter("yearMin")}
                className="rounded-lg border border-border-2 bg-white px-3 py-2 text-sm text-dark outline-none focus:border-primary"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-dark" htmlFor="catalog-year-max-input">
                Año máximo
              </label>
              <input
                id="catalog-year-max-input"
                data-testid="catalog-year-max-input"
                type="number"
                value={filters.yearMax}
                onChange={updateFilter("yearMax")}
                className="rounded-lg border border-border-2 bg-white px-3 py-2 text-sm text-dark outline-none focus:border-primary"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-dark" htmlFor="catalog-price-min-input">
                Precio mínimo
              </label>
              <input
                id="catalog-price-min-input"
                data-testid="catalog-price-min-input"
                type="number"
                value={filters.priceMin}
                onChange={updateFilter("priceMin")}
                className="rounded-lg border border-border-2 bg-white px-3 py-2 text-sm text-dark outline-none focus:border-primary"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-dark" htmlFor="catalog-price-max-input">
                Precio máximo
              </label>
              <input
                id="catalog-price-max-input"
                data-testid="catalog-price-max-input"
                type="number"
                value={filters.priceMax}
                onChange={updateFilter("priceMax")}
                className="rounded-lg border border-border-2 bg-white px-3 py-2 text-sm text-dark outline-none focus:border-primary"
              />
            </div>
          </div>
        </section>

        {isPending ? (
          <p data-testid="catalog-loading" className="text-sm text-muted">
            Cargando…
          </p>
        ) : vehicleList.length === 0 ? (
          <p data-testid="catalog-empty" className="text-sm text-muted">
            No hay vehículos visibles todavía.
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            <p data-testid="catalog-result-count" className="text-sm text-muted">
              {filteredVehicles.length}{" "}
              {filteredVehicles.length === 1 ? "vehículo visible" : "vehículos visibles"} en tu red
            </p>
            {filteredVehicles.length === 0 ? (
              <p data-testid="catalog-filtered-empty" className="text-sm text-muted">
                No hay resultados para estos filtros.
              </p>
            ) : (
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {filteredVehicles.map((vehicle) => (
                  <VehicleCatalogCard
                    key={vehicle.id}
                    vehicle={vehicle}
                    myTenantId={myTenantId}
                    currentUserId={currentUserId}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
