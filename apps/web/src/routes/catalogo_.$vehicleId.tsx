import type { Json } from "@red-aliados/contracts/db";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { supabaseClient, useSessionClaims } from "@/features/identity-bridge";
import { useCreateConnectionRequest } from "@/features/network-connections";
import { useReputationScore } from "@/features/partner-reputation";
import { useCreateSearchRequest } from "@/features/targeted-search";
import { useVehiclePhotos, useVisibleVehicles, type VisibleVehicle } from "@/features/vehicle-sync";
import { Topbar } from "@/shared/ui/Topbar";

// Vehicle detail page, reached from routes/catalogo.tsx's cards. Reuses
// useVisibleVehicles() as-is to find the specific vehicle by id -- that
// query already fetches every vehicle the caller can see, with tier-based
// masking applied server-side (vehicle_snapshots_public); there is no
// separate single-vehicle read function, adding one would just duplicate
// the same view with an extra `.eq("id", ...)` for no real benefit (the
// list is already cached by TanStack Query under
// ["vehicle-sync", "visible-vehicles"] once catalogo.tsx has been visited,
// and is cheap to fetch fresh otherwise).
//
// Deliberately does NOT render mileage, city/zona, vehicle category,
// "especificaciones técnicas" (motor/potencia/torque/etc.), "miembro desde",
// or a "tasa de respuesta" -- none of those exist anywhere in this schema
// (vehicle_snapshots, vehicle_snapshots_public, tenants). Every field on
// this page traces back to a real column or a real computed value.
export const Route = createFileRoute("/catalogo_/$vehicleId")({
  component: VehicleDetailPage,
});

const CURRENCY_FORMATTER = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

function formatPrice(value: number | null): string {
  return value === null ? "Sin definir" : CURRENCY_FORMATTER.format(value);
}

/** `available` / `sold` / whatever V2 sends -- free text (no check constraint on this column, 0001_core_schema.sql), so this only reformats it, never maps to a fabricated label set. */
function formatStatus(status: string): string {
  const spaced = status.replace(/_/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/**
 * SessionClaims (identity-bridge/domain/session-claims.ts) carries
 * tenantId/role/redAliadosEnabled but no user id -- creating a connection
 * request or a search request needs one. Reads it straight from Supabase's
 * own auth user, same pattern routes/catalogo.tsx already established for
 * this exact gap.
 */
function useCurrentUserId() {
  return useQuery({
    queryKey: ["catalogo-vehicle-detail", "current-user-id"],
    queryFn: async () => {
      const { data, error } = await supabaseClient.auth.getUser();
      if (error || !data.user) {
        return null;
      }
      return data.user.id;
    },
  });
}

interface PhotoGalleryProps {
  readonly photos: readonly { readonly id: string; readonly url: string }[];
  readonly isLoading: boolean;
  readonly altLabel: string;
}

/**
 * Real photos, via vehicle-sync's fetchVehiclePhotos/useVehiclePhotos
 * (vehicle_snapshot_photos, RLS-gated on the parent snapshot's own
 * visibility). Currently always empty across the whole test data set --
 * this renders ONE clean placeholder area in that case, never fabricated
 * placeholder thumbnails implying photos that don't exist.
 */
function PhotoGallery({ photos, isLoading, altLabel }: PhotoGalleryProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);

  if (isLoading) {
    return (
      <div
        data-testid="vehicle-photo-loading"
        className="flex h-64 items-center justify-center rounded-xl border border-border bg-white text-sm text-muted sm:h-80 lg:h-[420px]"
      >
        Cargando…
      </div>
    );
  }

  if (photos.length === 0) {
    return (
      <div
        data-testid="vehicle-photo-placeholder"
        className="flex h-64 flex-col items-center justify-center gap-2 rounded-xl border border-border bg-tint text-center sm:h-80 lg:h-[420px]"
      >
        <span aria-hidden="true" className="text-3xl">
          🚗
        </span>
        <p className="text-sm text-muted">Todavía no hay fotos cargadas para este vehículo.</p>
      </div>
    );
  }

  const selected = photos[selectedIndex] ?? photos[0];

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-hidden rounded-xl border border-border bg-white">
        <img
          data-testid="vehicle-photo-main"
          src={selected?.url}
          alt={altLabel}
          className="h-64 w-full object-cover sm:h-80 lg:h-[420px]"
        />
      </div>
      {photos.length > 1 ? (
        <div data-testid="vehicle-photo-thumbnails" className="flex gap-2 overflow-x-auto">
          {photos.map((photo, index) => (
            <button
              key={photo.id}
              type="button"
              data-testid="vehicle-photo-thumbnail"
              onClick={() => setSelectedIndex(index)}
              className={`shrink-0 overflow-hidden rounded-lg border-2 transition-colors ${
                index === selectedIndex ? "border-primary" : "border-transparent"
              }`}
            >
              <img src={photo.url} alt="" className="h-16 w-20 object-cover" />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

interface IdentityCardProps {
  readonly vehicle: VisibleVehicle;
}

/**
 * Same tier-based masking as routes/catalogo.tsx's card: real
 * tenantName/contactPhone at connected/owner tier, an honest masking
 * explanation otherwise. Real reputation via useReputationScore(tenantId),
 * shown the same 0-5 scale routes/index.tsx's ReputationStatCard already
 * established -- no "miembro desde", no fabricated response rate.
 */
function IdentityCard({ vehicle }: IdentityCardProps) {
  const reputation = useReputationScore(vehicle.tenantId);
  const identityRevealed = vehicle.tenantName !== null;

  return (
    <div
      data-testid="vehicle-identity-card"
      className="flex flex-col gap-2 border-t border-border pt-4"
    >
      <h3 className="font-head text-sm font-semibold text-dark">Aliado</h3>
      {identityRevealed ? (
        <>
          <p data-testid="vehicle-identity-name" className="text-sm font-semibold text-dark">
            {vehicle.tenantName}
          </p>
          {vehicle.contactPhone ? (
            <p data-testid="vehicle-identity-phone" className="text-sm text-body">
              {vehicle.contactPhone}
            </p>
          ) : null}
        </>
      ) : (
        <p data-testid="vehicle-identity-masked" className="text-sm text-muted">
          Identidad oculta hasta aceptar conexión.
        </p>
      )}

      {reputation.isLoading ? null : reputation.score === null ? (
        <p data-testid="vehicle-identity-reputation-unrated" className="text-xs text-muted">
          Sin calificar todavía
        </p>
      ) : (
        <p data-testid="vehicle-identity-reputation" className="text-xs text-muted">
          Reputación: {(reputation.score / 20).toFixed(1)} / 5 ({reputation.sampleSize}{" "}
          {reputation.sampleSize === 1 ? "operación" : "operaciones"})
        </p>
      )}
    </div>
  );
}

interface VehicleActionsProps {
  readonly vehicle: VisibleVehicle;
  readonly myTenantId: string | undefined;
  readonly currentUserId: string | null | undefined;
}

function VehicleActions({ vehicle, myTenantId, currentUserId }: VehicleActionsProps) {
  const navigate = useNavigate();
  const [requestSent, setRequestSent] = useState(false);
  const [shareConfirmed, setShareConfirmed] = useState(false);
  const createInterest = useCreateConnectionRequest();
  const createSimilarRequest = useCreateSearchRequest();

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

  function handleRequestSimilar() {
    if (!myTenantId || !currentUserId) {
      return;
    }
    const criteria: Record<string, Json> = { make: vehicle.make, model: vehicle.model };
    createSimilarRequest.mutate(
      { tenantId: myTenantId, requestedBy: currentUserId, criteria },
      { onSuccess: () => navigate({ to: "/solicitudes" }) },
    );
  }

  async function handleShare() {
    const shareData = { title: `${vehicle.make} ${vehicle.model}`, url: window.location.href };
    if (navigator.share) {
      try {
        await navigator.share(shareData);
      } catch {
        // User cancelled the native share sheet -- not an error to surface.
      }
      return;
    }
    await navigator.clipboard.writeText(window.location.href);
    setShareConfirmed(true);
    window.setTimeout(() => setShareConfirmed(false), 2000);
  }

  return (
    <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
      {isOwnVehicle ? null : requestSent ? (
        <button
          type="button"
          disabled
          data-testid="vehicle-interest-sent"
          className="rounded-full border border-border-2 bg-white px-5 py-2.5 text-sm font-semibold text-muted disabled:opacity-70"
        >
          Solicitud enviada
        </button>
      ) : (
        <button
          type="button"
          data-testid="vehicle-interest-button"
          disabled={createInterest.isPending || !myTenantId || !currentUserId}
          onClick={handleInterest}
          className="rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:opacity-90 disabled:opacity-50"
        >
          Me interesa
        </button>
      )}

      <button
        type="button"
        data-testid="vehicle-request-similar-button"
        disabled={createSimilarRequest.isPending || !myTenantId || !currentUserId}
        onClick={handleRequestSimilar}
        className="rounded-full border border-border-2 bg-white px-5 py-2.5 text-sm font-semibold text-dark transition-colors hover:border-primary hover:text-primary disabled:opacity-50"
      >
        Solicitar similar
      </button>

      <button
        type="button"
        data-testid="vehicle-share-button"
        onClick={handleShare}
        className="rounded-full border border-border-2 bg-white px-5 py-2.5 text-sm font-semibold text-dark transition-colors hover:border-primary hover:text-primary"
      >
        {shareConfirmed ? "Enlace copiado" : "Compartir"}
      </button>
    </div>
  );
}

export function VehicleDetailPage() {
  const { vehicleId } = Route.useParams();
  const { data: session } = useSessionClaims();
  const myTenantId = session?.status === "authenticated" ? session.claims.tenantId : undefined;
  const { data: currentUserId } = useCurrentUserId();

  const { data: vehicles, isPending: isVehiclesPending } = useVisibleVehicles();
  const vehicle = useMemo(
    () => (vehicles ?? []).find((candidate) => candidate.id === vehicleId),
    [vehicles, vehicleId],
  );

  const { data: photos, isPending: isPhotosPending } = useVehiclePhotos(vehicle?.id);

  return (
    <div className="min-h-screen bg-bg">
      <Topbar />
      <main className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-10">
        <nav aria-label="Breadcrumb" className="text-sm text-muted">
          <Link to="/catalogo" className="hover:text-primary hover:underline">
            Catálogo
          </Link>
          {vehicle ? (
            <span data-testid="vehicle-detail-breadcrumb-current">
              {" "}
              / {vehicle.make} {vehicle.model} {vehicle.year ?? ""}
            </span>
          ) : null}
        </nav>

        {isVehiclesPending ? (
          <p data-testid="vehicle-detail-loading" className="text-sm text-muted">
            Cargando…
          </p>
        ) : !vehicle ? (
          <div
            data-testid="vehicle-detail-not-found"
            className="flex flex-col items-start gap-3 rounded-xl border border-border bg-white p-6 shadow-sm"
          >
            <p className="text-sm text-body">
              No encontramos este vehículo, o ya no está visible para vos.
            </p>
            <Link
              to="/catalogo"
              className="rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:opacity-90"
            >
              Volver al catálogo
            </Link>
          </div>
        ) : (
          <div className="flex flex-col gap-8 lg:grid lg:grid-cols-[1.6fr_1fr] lg:items-start">
            <PhotoGallery
              photos={photos ?? []}
              isLoading={isPhotosPending}
              altLabel={`${vehicle.make} ${vehicle.model}`}
            />

            <div
              data-testid="vehicle-detail-info-card"
              className="flex flex-col gap-4 rounded-xl border border-border bg-white p-6 shadow-sm"
            >
              <div>
                <h1 className="font-head text-2xl font-bold text-dark">
                  {vehicle.make} {vehicle.model}
                </h1>
                <p className="text-sm text-muted">{vehicle.year ?? "Año sin definir"}</p>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex flex-col">
                  <span
                    data-testid="vehicle-detail-price"
                    className="font-head text-2xl font-bold text-dark"
                  >
                    {formatPrice(vehicle.allyPrice)}
                  </span>
                  <span className="text-xs text-faint">Precio aliados</span>
                </div>
                <span
                  data-testid="vehicle-detail-status"
                  className="rounded-full bg-tint px-3 py-1 text-xs font-semibold text-primary"
                >
                  {formatStatus(vehicle.status)}
                </span>
              </div>

              {vehicle.minPrice !== null ? (
                <p data-testid="vehicle-detail-min-price" className="text-sm text-muted">
                  Precio mínimo: {formatPrice(vehicle.minPrice)}
                </p>
              ) : null}

              <p data-testid="vehicle-detail-views" className="text-xs text-muted">
                {vehicle.viewsCount} {vehicle.viewsCount === 1 ? "vista" : "vistas"}
              </p>

              <IdentityCard vehicle={vehicle} />

              <VehicleActions
                vehicle={vehicle}
                myTenantId={myTenantId}
                currentUserId={currentUserId}
              />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
