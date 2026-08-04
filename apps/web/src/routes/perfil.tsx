import { createFileRoute } from "@tanstack/react-router";
import { useSessionClaims } from "@/features/identity-bridge";
import { useReputationScore } from "@/features/partner-reputation";
import { useTenantDirectoryEntry } from "@/features/tenant-directory";
import { Topbar } from "@/shared/ui/Topbar";

// "Perfil" -- the signed-in tenant's own identity + computed reputation.
// Only composes already-tested hooks (identity-bridge, tenant-directory,
// partner-reputation) -- no new query/mutation logic lives here, same
// convention every other route in this session established. Reputation is
// read-only from the client (partner-reputation spec: "Score is read-only")
// -- there is no edit affordance here, only the computed score.
export const Route = createFileRoute("/perfil")({
  component: PerfilPage,
});

const ROLE_LABEL: Record<string, string> = {
  dealer_admin: "Administrador",
  dealer_user: "Usuario",
};

export function PerfilPage() {
  const { data: session } = useSessionClaims();
  const tenantId = session?.status === "authenticated" ? session.claims.tenantId : undefined;
  const role = session?.status === "authenticated" ? session.claims.role : undefined;

  // Targeting the caller's own tenant id resolves visibility_tier to
  // 'owner' (network-authorization: a tenant always sees its own data),
  // which is why this works without a network-access grant the way
  // useReputationScore reading a THIRD PARTY tenant would need one.
  const directory = useTenantDirectoryEntry(tenantId);
  const reputation = useReputationScore(tenantId);

  return (
    <div className="min-h-screen bg-bg">
      <Topbar />
      <main className="mx-auto flex max-w-3xl flex-col gap-8 px-6 py-10">
        <div>
          <h1 className="font-head text-2xl font-bold text-dark">Perfil</h1>
          <p className="mt-1 text-sm text-body">Tu concesionaria y tu reputación en la red.</p>
        </div>

        <section className="rounded-xl border border-border bg-white p-6 shadow-sm">
          {directory.isLoading ? (
            <p data-testid="profile-loading" className="text-sm text-muted">
              Cargando…
            </p>
          ) : (
            <div className="flex flex-col gap-1">
              <h2
                data-testid="profile-tenant-name"
                className="font-head text-xl font-semibold text-dark"
              >
                {directory.entry?.tenantName ?? "Tu concesionaria"}
              </h2>
              {directory.entry?.contactPhone ? (
                <p data-testid="profile-contact-phone" className="text-sm text-body">
                  {directory.entry.contactPhone}
                </p>
              ) : null}
              {role ? (
                <span className="mt-2 w-fit rounded-full bg-tint px-3 py-1 text-xs font-semibold uppercase tracking-wide text-primary">
                  {ROLE_LABEL[role] ?? role}
                </span>
              ) : null}
            </div>
          )}
        </section>

        <section className="rounded-xl border border-border bg-white p-6 shadow-sm">
          <h2 className="font-head text-lg font-semibold text-dark">Reputación</h2>
          {reputation.isLoading ? (
            <p data-testid="reputation-loading" className="mt-2 text-sm text-muted">
              Cargando…
            </p>
          ) : reputation.score !== null ? (
            <div className="mt-3 flex items-baseline gap-3">
              <span
                data-testid="reputation-score"
                className="font-head text-4xl font-bold text-primary"
              >
                {reputation.score.toFixed(0)}
              </span>
              <span data-testid="reputation-sample-size" className="text-sm text-muted">
                sobre {reputation.sampleSize}{" "}
                {reputation.sampleSize === 1 ? "operación" : "operaciones"}
              </span>
            </div>
          ) : (
            <p data-testid="reputation-unrated" className="mt-2 text-sm text-muted">
              Todavía no tenés operaciones cerradas -- tu reputación se calcula con cada conexión
              aceptada, rechazada o vencida.
            </p>
          )}
        </section>
      </main>
    </div>
  );
}
