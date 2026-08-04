import type { Json } from "@red-aliados/contracts/db";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { type ChangeEvent, type FormEvent, useState } from "react";
import { supabaseClient, useSessionClaims } from "@/features/identity-bridge";
import {
  type SearchMatch,
  type SearchRequestRow,
  useCreateSearchRequest,
  useOptInFanOut,
  useOwnSearchRequests,
  useProceedOnMatch,
  useSearchMatches,
} from "@/features/targeted-search";
import { Topbar } from "@/shared/ui/Topbar";

// "Conseguir" -- register a sourcing request, search own inventory first,
// then optionally fan out to connected tenants. This route is the first
// real authenticated UI for targeted-search: it only composes the
// already-tested data/hooks layer (features/targeted-search/data,
// features/targeted-search/hooks) -- no query/mutation logic lives here.
// Stays inside the normal IdentityGate-protected area (routes/__root.tsx
// only special-cases "/login"), so no extra wiring is needed there.
export const Route = createFileRoute("/solicitudes")({
  component: SolicitudesPage,
});

const CURRENCY_FORMATTER = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

const STATUS_LABEL: Record<SearchRequestRow["status"], string> = {
  open: "Abierta",
  fulfilled: "Cumplida",
  closed: "Cerrada",
};

interface CriteriaFormState {
  readonly vehicleType: string;
  readonly make: string;
  readonly model: string;
  readonly yearFrom: string;
  readonly yearTo: string;
  readonly maxBudget: string;
  readonly location: string;
  readonly description: string;
}

const EMPTY_CRITERIA_FORM: CriteriaFormState = {
  vehicleType: "",
  make: "",
  model: "",
  yearFrom: "",
  yearTo: "",
  maxBudget: "",
  location: "",
  description: "",
};

// `criteria` is free-form jsonb (Record<string, Json> per
// CreateSearchRequestInput) -- there are no dedicated DB columns for any of
// this, this route owns the key naming, kept internally consistent since
// nothing else reads this shape yet.
function buildCriteria(form: CriteriaFormState): Record<string, Json> {
  const criteria: Record<string, Json> = {};
  if (form.vehicleType.trim()) criteria.vehicleType = form.vehicleType.trim();
  if (form.make.trim()) criteria.make = form.make.trim();
  if (form.model.trim()) criteria.model = form.model.trim();
  if (form.yearFrom.trim()) criteria.yearFrom = Number(form.yearFrom);
  if (form.yearTo.trim()) criteria.yearTo = Number(form.yearTo);
  if (form.maxBudget.trim()) criteria.maxBudget = Number(form.maxBudget);
  if (form.location.trim()) criteria.location = form.location.trim();
  if (form.description.trim()) criteria.description = form.description.trim();
  return criteria;
}

function readCriteriaField(criteria: Json, key: string): string | null {
  if (typeof criteria !== "object" || criteria === null || Array.isArray(criteria)) {
    return null;
  }
  const value = (criteria as Record<string, Json | undefined>)[key];
  return value === undefined || value === null ? null : String(value);
}

/**
 * SessionClaims (identity-bridge/domain/session-claims.ts) carries
 * tenantId/role/redAliadosEnabled but no user id -- targeted-search's write
 * functions (createSearchRequest, proceedOnMatch) need one. Reads it
 * straight from Supabase's own auth user, the one source that actually has
 * it, rather than fabricating a value.
 */
function useCurrentUserId() {
  return useQuery({
    queryKey: ["solicitudes", "current-user-id"],
    queryFn: async () => {
      const { data, error } = await supabaseClient.auth.getUser();
      if (error || !data.user) {
        return null;
      }
      return data.user.id;
    },
  });
}

function CriteriaSummary({ criteria }: { readonly criteria: Json }) {
  const make = readCriteriaField(criteria, "make");
  const model = readCriteriaField(criteria, "model");
  const yearFrom = readCriteriaField(criteria, "yearFrom");
  const yearTo = readCriteriaField(criteria, "yearTo");
  const maxBudget = readCriteriaField(criteria, "maxBudget");
  const location = readCriteriaField(criteria, "location");
  const description = readCriteriaField(criteria, "description");

  const title = [make, model].filter(Boolean).join(" ") || "Vehículo sin especificar";
  const yearRange = yearFrom || yearTo ? `${yearFrom ?? "…"} – ${yearTo ?? "…"}` : null;

  return (
    <div data-testid="search-request-criteria" className="flex flex-col gap-0.5">
      <h3 className="font-head text-base font-semibold text-dark">{title}</h3>
      {yearRange ? <p className="text-sm text-body">{yearRange}</p> : null}
      {maxBudget ? (
        <p className="text-sm text-body">
          Presupuesto máx: {CURRENCY_FORMATTER.format(Number(maxBudget))}
        </p>
      ) : null}
      {location ? <p className="text-sm text-muted">{location}</p> : null}
      {description ? <p className="text-xs text-faint">{description}</p> : null}
    </div>
  );
}

interface SearchRequestCardProps {
  readonly request: SearchRequestRow;
  readonly tenantId: string;
  readonly currentUserId: string | null | undefined;
}

function SearchRequestCard({ request, tenantId, currentUserId }: SearchRequestCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Own inventory/network reads only fire once expanded -- there is no
  // reason to run one query per card for every request on first paint.
  const { matches, isLoading } = useSearchMatches({
    tenantId: isExpanded ? tenantId : undefined,
    searchRequestId: isExpanded ? request.id : undefined,
    fanOutEnabled: request.opted_in_fan_out,
  });

  const optIn = useOptInFanOut();
  const proceed = useProceedOnMatch();

  function handleOptIn() {
    // useOptInFanOut re-derives the caller's actually-connected tenants
    // itself (fetchConnectedTenantIds) before writing anything -- there is
    // no tenant-picker UI yet, so an empty candidate list is a fine first
    // pass, see that hook's own doc comment.
    optIn.mutate({ searchRequestId: request.id, candidateTenantIds: [] });
  }

  function handleProceed(match: SearchMatch) {
    if (!currentUserId) {
      return;
    }
    proceed.mutate({
      searchRequestId: request.id,
      vehicleSnapshotId: match.vehicleSnapshotId,
      matchedTenantId: match.matchOwnerTenantId,
      proceededBy: currentUserId,
    });
  }

  return (
    <article
      data-testid="search-request-card"
      className="rounded-xl border border-border bg-white p-5 shadow-sm"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <CriteriaSummary criteria={request.criteria} />
        <div className="flex flex-wrap items-center gap-2">
          <span
            data-testid="search-request-status"
            className="rounded-full bg-tint px-3 py-1 text-xs font-semibold uppercase tracking-wide text-primary"
          >
            {STATUS_LABEL[request.status]}
          </span>
          <span className="rounded-full border border-border-2 px-3 py-1 text-xs font-semibold text-muted">
            {request.opted_in_fan_out ? "En la red" : "Solo inventario propio"}
          </span>
        </div>
      </div>

      <button
        type="button"
        data-testid="search-request-toggle-button"
        onClick={() => setIsExpanded((current) => !current)}
        className="mt-4 text-sm font-semibold text-primary hover:underline"
      >
        {isExpanded ? "Ocultar coincidencias" : "Ver coincidencias"}
      </button>

      {isExpanded ? (
        <div className="mt-4 flex flex-col gap-3 border-t border-border pt-4">
          {isLoading ? (
            <p data-testid="search-matches-loading" className="text-sm text-muted">
              Buscando coincidencias…
            </p>
          ) : matches.length === 0 ? (
            <p data-testid="search-matches-empty" className="text-sm text-muted">
              Todavía no hay coincidencias.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {matches.map((match) => (
                <li
                  key={match.id}
                  data-testid="search-match-item"
                  data-source={match.source}
                  className="rounded-lg border border-border bg-bg p-3 text-sm"
                >
                  {match.source === "own_inventory" ? (
                    <p className="font-medium text-dark">
                      {match.make} {match.model} {match.year ?? ""}
                    </p>
                  ) : (
                    // Network matches come back with empty make/model
                    // (useSearchMatches' own doc comment: the caller
                    // resolves those from vehicle_snapshots_public
                    // separately). Follow-up, not done here: join against
                    // that view by match.vehicleSnapshotId to show the real
                    // make/model instead of this generic card.
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <p className="font-medium text-dark">Un aliado tiene un vehículo similar.</p>
                      <button
                        type="button"
                        data-testid="search-match-proceed-button"
                        disabled={proceed.isPending || !currentUserId}
                        onClick={() => handleProceed(match)}
                        className="self-start rounded-full bg-primary px-4 py-1.5 text-xs font-semibold text-white disabled:opacity-50 sm:self-auto"
                      >
                        Proceder
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}

          {!request.opted_in_fan_out ? (
            <button
              type="button"
              data-testid="search-request-optin-button"
              disabled={optIn.isPending}
              onClick={handleOptIn}
              className="self-start rounded-full border border-border-2 bg-white px-4 py-2 text-xs font-semibold text-dark transition-colors hover:border-primary hover:text-primary disabled:opacity-50"
            >
              Activar búsqueda en la red
            </button>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

interface FormFieldProps {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  readonly type?: string;
  readonly className?: string;
}

function FormField({ id, label, value, onChange, type = "text", className }: FormFieldProps) {
  return (
    <div className={`flex flex-col gap-1 ${className ?? ""}`}>
      <label className="text-sm font-medium text-dark" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        data-testid={id}
        type={type}
        value={value}
        onChange={onChange}
        className="rounded-lg border border-border-2 bg-white px-3 py-2 text-sm text-dark outline-none focus:border-primary"
      />
    </div>
  );
}

export function SolicitudesPage() {
  const { data: session } = useSessionClaims();
  const tenantId = session?.status === "authenticated" ? session.claims.tenantId : undefined;
  const { data: currentUserId } = useCurrentUserId();

  const { data: requests, isPending } = useOwnSearchRequests(tenantId);
  const createRequest = useCreateSearchRequest();

  const [form, setForm] = useState<CriteriaFormState>(EMPTY_CRITERIA_FORM);

  function updateField(field: keyof CriteriaFormState) {
    return (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setForm((current) => ({ ...current, [field]: event.target.value }));
    };
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!tenantId || !currentUserId) {
      return;
    }
    createRequest.mutate(
      { tenantId, requestedBy: currentUserId, criteria: buildCriteria(form) },
      { onSuccess: () => setForm(EMPTY_CRITERIA_FORM) },
    );
  }

  return (
    <div className="min-h-screen bg-bg">
      <Topbar />
      <main className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-10">
        <div>
          <h1 className="font-head text-2xl font-bold text-dark">Conseguir</h1>
          <p className="mt-1 text-sm text-body">
            Publicá lo que estás buscando y lo encontramos primero en tu inventario, después en tu
            red.
          </p>
        </div>

        <section
          data-testid="search-request-form-section"
          className="rounded-xl border border-border bg-white p-5 shadow-sm"
        >
          <h2 className="font-head text-lg font-semibold text-dark">Publicar solicitud</h2>
          <form
            data-testid="search-request-form"
            onSubmit={handleSubmit}
            className="mt-4 grid gap-4 sm:grid-cols-2"
          >
            <FormField
              id="search-request-vehicle-type-input"
              label="Tipo de vehículo"
              value={form.vehicleType}
              onChange={updateField("vehicleType")}
            />
            <FormField
              id="search-request-make-input"
              label="Marca"
              value={form.make}
              onChange={updateField("make")}
            />
            <FormField
              id="search-request-model-input"
              label="Modelo"
              value={form.model}
              onChange={updateField("model")}
            />
            <FormField
              id="search-request-location-input"
              label="Ubicación"
              value={form.location}
              onChange={updateField("location")}
            />
            <FormField
              id="search-request-year-from-input"
              label="Año desde"
              type="number"
              value={form.yearFrom}
              onChange={updateField("yearFrom")}
            />
            <FormField
              id="search-request-year-to-input"
              label="Año hasta"
              type="number"
              value={form.yearTo}
              onChange={updateField("yearTo")}
            />
            <FormField
              id="search-request-budget-input"
              label="Presupuesto máximo"
              type="number"
              value={form.maxBudget}
              onChange={updateField("maxBudget")}
              className="sm:col-span-2"
            />
            <div className="flex flex-col gap-1 sm:col-span-2">
              <label
                className="text-sm font-medium text-dark"
                htmlFor="search-request-description-input"
              >
                Descripción
              </label>
              <textarea
                id="search-request-description-input"
                data-testid="search-request-description-input"
                value={form.description}
                onChange={updateField("description")}
                rows={3}
                className="rounded-lg border border-border-2 bg-white px-3 py-2 text-sm text-dark outline-none focus:border-primary"
              />
            </div>

            <button
              type="submit"
              data-testid="search-request-submit-button"
              disabled={createRequest.isPending || !tenantId}
              className="self-start rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:opacity-90 disabled:opacity-50 sm:col-span-2"
            >
              {createRequest.isPending ? "Publicando…" : "Publicar solicitud"}
            </button>
          </form>
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="font-head text-lg font-semibold text-dark">Mis solicitudes</h2>
          {isPending ? (
            <p data-testid="search-requests-loading" className="text-sm text-muted">
              Cargando…
            </p>
          ) : requests && requests.length > 0 ? (
            <div className="flex flex-col gap-4">
              {requests.map((request) => (
                <SearchRequestCard
                  key={request.id}
                  request={request}
                  tenantId={tenantId as string}
                  currentUserId={currentUserId}
                />
              ))}
            </div>
          ) : (
            <p data-testid="search-requests-empty" className="text-sm text-muted">
              Todavía no publicaste ninguna solicitud.
            </p>
          )}
        </section>
      </main>
    </div>
  );
}
