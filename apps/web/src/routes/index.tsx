import { createFileRoute, Link } from "@tanstack/react-router";
import {
  type ConnectionMessageRow,
  useRecentIncomingMessages,
} from "@/features/connection-messaging";
import { useSessionClaims } from "@/features/identity-bridge";
import {
  type ConnectionRequestRow,
  useMyConnectionEdges,
  useMyConnectionRequests,
} from "@/features/network-connections";
import { useReputationScore } from "@/features/partner-reputation";
import { useOwnSearchRequests } from "@/features/targeted-search";
import { useTenantDirectoryEntry } from "@/features/tenant-directory";
import type { OwnTenantVehicle } from "@/features/vehicle-sync";
import { useOwnTenantVehicles } from "@/features/vehicle-sync";
import { formatRelativeTime } from "@/shared/lib/relative-time";
import { Topbar } from "@/shared/ui/Topbar";

// Authenticated dashboard -- home base once signed in. Only composes
// already-tested data/hooks layers (vehicle-sync, targeted-search,
// network-connections, partner-reputation, connection-messaging,
// tenant-directory) -- no new query/mutation logic lives here beyond the
// small activity-feed merge below, same convention every other route in
// this session established.
//
// Every number on this page comes from a real query. There is deliberately
// NO "Publicar vehículo" action anywhere on this page: vehicle-sync's own
// spec (Read-Only Mirror) requires Red Aliados to never expose a write path
// back to vehicle/tenant data -- vehicles only ever arrive one-way from
// Avaluauto V2. The only inventory-adjacent CTA here is "Publicar
// solicitud" (routes/solicitudes.tsx), a real write path this app does own.
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

// --- Activity feed -----------------------------------------------------
// Merges two REAL, already-fetchable signals into one feed, newest first:
// recently accepted connections (network-connections) and recent incoming
// messages (connection-messaging). There is no per-tenant "unread
// messages" feature in this schema (connection_messages' own table
// comment: "No attachments/presence/read-receipts") -- rather than fabricate
// an unread count or a richer feed than the data supports, this stays
// deliberately small and honest: no sender/counterpart name resolution
// (that would need one extra directory lookup per row), just what kind of
// thing happened, a short real detail (the message body itself, truncated,
// for messages), and when.

interface ActivityItem {
  readonly id: string;
  readonly at: string;
  readonly kind: "connection_accepted" | "message";
  readonly label: string;
}

const ACTIVITY_FEED_LIMIT = 6;
const MESSAGE_PREVIEW_LENGTH = 60;

function truncate(text: string, maxLength: number): string {
  return text.length > maxLength ? `${text.slice(0, maxLength).trimEnd()}…` : text;
}

function buildActivityFeed(
  connectionRequests: readonly ConnectionRequestRow[],
  incomingMessages: readonly ConnectionMessageRow[],
): ActivityItem[] {
  const connectionItems: ActivityItem[] = connectionRequests
    .filter((request) => request.status === "accepted")
    .map((request) => ({
      id: `connection-${request.id}`,
      at: request.responded_at ?? request.updated_at,
      kind: "connection_accepted",
      label: "Se aceptó una nueva conexión.",
    }));

  const messageItems: ActivityItem[] = incomingMessages.map((message) => ({
    id: `message-${message.id}`,
    at: message.created_at,
    kind: "message",
    label: `Nuevo mensaje: "${truncate(message.body, MESSAGE_PREVIEW_LENGTH)}"`,
  }));

  return [...connectionItems, ...messageItems]
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, ACTIVITY_FEED_LIMIT);
}

const ACTIVITY_ICON: Record<ActivityItem["kind"], string> = {
  connection_accepted: "✓",
  message: "✉",
};

function ActivityFeed({
  items,
  isLoading,
}: {
  readonly items: readonly ActivityItem[];
  readonly isLoading: boolean;
}) {
  if (isLoading) {
    return (
      <p data-testid="activity-feed-loading" className="text-sm text-muted">
        Cargando…
      </p>
    );
  }
  if (items.length === 0) {
    return (
      <p data-testid="activity-feed-empty" className="text-sm text-muted">
        Todavía no hay actividad reciente.
      </p>
    );
  }
  return (
    <ul className="flex flex-col gap-4">
      {items.map((item) => (
        <li key={item.id} data-testid="activity-item" className="flex items-start gap-3">
          <span
            aria-hidden="true"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-tint text-sm font-semibold text-primary"
          >
            {ACTIVITY_ICON[item.kind]}
          </span>
          <div className="flex flex-col gap-0.5">
            <p className="text-sm font-semibold text-dark">{item.label}</p>
            <p className="text-xs text-muted">{formatRelativeTime(item.at)}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}

// --- Vistas por vehículo chart ------------------------------------------
// A real bar chart of views_count per vehicle -- there is no time-series
// interest/view-history data anywhere (vehicle_snapshots.views_count is a
// single running total, not a weekly series), so this deliberately does
// NOT pretend to show a trend over time. Plain divs + inline height styles,
// no charting dependency.

const CHART_MAX_BARS = 8;

function VehicleViewsChart({
  vehicles,
  isPending,
}: {
  readonly vehicles: readonly OwnTenantVehicle[] | undefined;
  readonly isPending: boolean;
}) {
  if (isPending) {
    return (
      <p data-testid="vehicle-views-chart-loading" className="text-sm text-muted">
        Cargando…
      </p>
    );
  }
  if (!vehicles || vehicles.length === 0) {
    return (
      <p data-testid="vehicle-views-chart-empty" className="text-sm text-muted">
        Todavía no tenés vehículos para mostrar vistas.
      </p>
    );
  }

  const topVehicles = [...vehicles]
    .sort((a, b) => b.viewsCount - a.viewsCount)
    .slice(0, CHART_MAX_BARS);
  const maxViews = Math.max(...topVehicles.map((vehicle) => vehicle.viewsCount), 1);

  return (
    <div data-testid="vehicle-views-chart" className="flex h-40 items-end gap-3">
      {topVehicles.map((vehicle) => {
        const heightPct = Math.max((vehicle.viewsCount / maxViews) * 100, 4);
        return (
          <div key={vehicle.id} className="flex flex-1 flex-col items-center gap-1">
            <span className="text-xs font-semibold text-dark">{vehicle.viewsCount}</span>
            <div
              data-testid="vehicle-views-bar"
              className="w-full rounded-t-md bg-primary"
              style={{ height: `${heightPct}%` }}
            />
            <span className="w-full truncate text-center text-[11px] text-muted">
              {vehicle.make} {vehicle.model}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// --- Stat cards -----------------------------------------------------------

interface StatCardProps {
  readonly testId: string;
  readonly label: string;
  readonly value: string;
  readonly context: string;
}

function StatCard({ testId, label, value, context }: StatCardProps) {
  return (
    <article
      data-testid={testId}
      className="flex flex-col gap-1 rounded-xl border border-border bg-white p-5 shadow-sm"
    >
      <p className="text-sm font-medium text-muted">{label}</p>
      <p className="font-head text-3xl font-bold text-dark">{value}</p>
      <p className="text-xs text-faint">{context}</p>
    </article>
  );
}

/**
 * Reputation is 0-100 under the hood (partner-reputation/domain/
 * reputation-score.ts) -- `(score / 20).toFixed(1)` is a legitimate
 * presentational transform onto a 0-5 scale, still real data. `score ===
 * null` ("unrated" -- no terminal events yet) gets its own honest state
 * instead of a fake number.
 */
function ReputationStatCard({ tenantId }: { readonly tenantId: string | undefined }) {
  const reputation = useReputationScore(tenantId);

  return (
    <article
      data-testid="stat-card-reputation"
      className="flex flex-col gap-1 rounded-xl border border-border bg-white p-5 shadow-sm"
    >
      <p className="text-sm font-medium text-muted">Reputación</p>
      {reputation.isLoading ? (
        <p className="font-head text-3xl font-bold text-dark">—</p>
      ) : reputation.score === null ? (
        <p data-testid="stat-reputation-unrated" className="mt-1 text-sm text-body">
          Sin calificar todavía
        </p>
      ) : (
        <>
          <p className="font-head text-3xl font-bold text-dark">
            {(reputation.score / 20).toFixed(1)}
            <span className="text-lg font-semibold text-muted"> / 5</span>
          </p>
          <p className="text-xs text-faint">
            {reputation.sampleSize} {reputation.sampleSize === 1 ? "operación" : "operaciones"}
          </p>
        </>
      )}
    </article>
  );
}

// --- Vehicle inventory grid -------------------------------------------

function VehicleCard({ vehicle }: { readonly vehicle: OwnTenantVehicle }) {
  return (
    <article
      data-testid="vehicle-card"
      className="flex flex-col overflow-hidden rounded-xl border border-border bg-white shadow-sm"
    >
      <div className="relative h-32 w-full bg-tint">
        <span className="absolute left-3 top-3 rounded-full bg-white/90 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-primary shadow-sm">
          {vehicle.status}
        </span>
      </div>
      <div className="flex flex-col gap-1 p-4">
        <h3 className="font-head text-base font-semibold text-dark">
          {vehicle.make} {vehicle.model}
        </h3>
        <p className="text-sm text-muted">{vehicle.year ?? "Año sin definir"}</p>
        <div className="mt-2 flex items-center justify-between">
          <span className="font-head text-lg font-bold text-dark">
            {formatPrice(vehicle.allyPrice)}
          </span>
          <span className="rounded-full bg-tint px-2.5 py-1 text-[11px] font-semibold text-primary">
            {vehicle.viewsCount} vistas
          </span>
        </div>
      </div>
    </article>
  );
}

export function HomePage() {
  const { data: session } = useSessionClaims();
  const tenantId = session?.status === "authenticated" ? session.claims.tenantId : undefined;

  // Targeting the caller's own tenant id resolves visibility_tier to
  // 'owner' (network-authorization: a tenant always sees its own data),
  // same reasoning routes/perfil.tsx already relies on -- this is only
  // used for the greeting's business name, never a fabricated human name
  // (this schema has no profiles/user-name table anywhere).
  const directory = useTenantDirectoryEntry(tenantId);

  const { data: vehicles, isPending: vehiclesLoading } = useOwnTenantVehicles();
  const { data: searchRequests, isPending: searchRequestsLoading } = useOwnSearchRequests(tenantId);
  const { data: connectionEdges, isPending: connectionsLoading } = useMyConnectionEdges();
  const { data: connectionRequests, isPending: connectionRequestsLoading } =
    useMyConnectionRequests();
  const { data: incomingMessages, isPending: incomingMessagesLoading } =
    useRecentIncomingMessages(tenantId);

  const openSearchRequestCount = (searchRequests ?? []).filter(
    (request) => request.status === "open",
  ).length;
  const activityItems = buildActivityFeed(connectionRequests ?? [], incomingMessages ?? []);
  const activityLoading = connectionRequestsLoading || incomingMessagesLoading;

  const greetingName = directory.entry?.tenantName ?? "tu concesionaria";

  return (
    <div className="min-h-screen bg-bg">
      <Topbar />
      <main className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-10">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 data-testid="dashboard-greeting" className="font-head text-2xl font-bold text-dark">
              Hola, {greetingName}
            </h1>
            <p className="mt-1 text-sm text-body">Así está tu operación en Red Aliados hoy.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              to="/solicitudes"
              data-testid="dashboard-cta-solicitudes"
              className="rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:opacity-90"
            >
              Publicar solicitud
            </Link>
            <Link
              to="/red"
              data-testid="dashboard-cta-red"
              className="rounded-full border border-border-2 bg-white px-5 py-2.5 text-sm font-semibold text-dark transition-colors hover:border-primary hover:text-primary"
            >
              Ver tu red
            </Link>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            testId="stat-card-vehicles"
            label="Vehículos publicados"
            value={vehiclesLoading ? "—" : String(vehicles?.length ?? 0)}
            context="Sincronizados desde Avaluauto"
          />
          <StatCard
            testId="stat-card-search-requests"
            label="Solicitudes activas"
            value={searchRequestsLoading ? "—" : String(openSearchRequestCount)}
            context="Solicitudes abiertas ahora mismo"
          />
          <StatCard
            testId="stat-card-connections"
            label="Conexiones activas"
            value={connectionsLoading ? "—" : String(connectionEdges?.length ?? 0)}
            context="Aliados conectados en tu red"
          />
          <ReputationStatCard tenantId={tenantId} />
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <section className="rounded-xl border border-border bg-white p-6 shadow-sm">
            <h2 className="font-head text-lg font-semibold text-dark">Vistas por vehículo</h2>
            <div className="mt-4">
              <VehicleViewsChart vehicles={vehicles} isPending={vehiclesLoading} />
            </div>
          </section>
          <section className="rounded-xl border border-border bg-white p-6 shadow-sm">
            <h2 className="font-head text-lg font-semibold text-dark">Actividad reciente</h2>
            <div className="mt-4">
              <ActivityFeed items={activityItems} isLoading={activityLoading} />
            </div>
          </section>
        </div>

        <section className="flex flex-col gap-4">
          <h2 className="font-head text-lg font-semibold text-dark">Mi inventario</h2>
          {vehiclesLoading ? (
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
        </section>
      </main>
    </div>
  );
}
