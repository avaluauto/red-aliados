// Data adapter for vehicle-sync. Reuses the single Supabase client instance
// from identity-bridge (never constructs its own client), and reads through
// `vehicle_snapshots_public` -- the ONE read path for vehicle inventory
// (see 0004_public_views.sql / tenant-directory's own data adapter doc
// comment for why the base `vehicle_snapshots` table can't be queried
// directly: its SELECT grant is revoked from `authenticated`).
import { supabaseClient } from "@/features/identity-bridge";
import type { VisibilityTier } from "@/features/network-authorization";

export interface OwnTenantVehicle {
  readonly id: string;
  readonly make: string;
  readonly model: string;
  readonly year: number | null;
  readonly allyPrice: number | null;
  readonly minPrice: number | null;
  readonly status: string;
  readonly viewsCount: number;
  readonly visibilityTier: VisibilityTier;
}

/**
 * Reads the caller's own tenant's vehicle inventory through
 * `vehicle_snapshots_public`, filtered to `targetTenantId`. Since this is
 * always called with the signed-in tenant's own id, `app.visibility_tier()`
 * resolves to `owner` for every row, so `min_price` comes back populated
 * (owner-only column, per the view's own doc comment).
 *
 * Returns an empty array on error, matching tenant-directory-queries.ts's
 * null-on-error style adapted for a list result (no throw).
 */
export async function fetchOwnTenantVehicles(tenantId: string): Promise<OwnTenantVehicle[]> {
  const { data, error } = await supabaseClient
    .from("vehicle_snapshots_public")
    .select("id, make, model, year, ally_price, min_price, status, views_count, visibility_tier")
    .eq("tenant_id", tenantId);

  if (error || !data) {
    return [];
  }

  return data.map((row) => ({
    id: row.id,
    make: row.make,
    model: row.model,
    year: row.year,
    allyPrice: row.ally_price,
    minPrice: row.min_price,
    status: row.status,
    viewsCount: row.views_count,
    visibilityTier: row.visibility_tier,
  }));
}

export interface VisibleVehicle {
  readonly id: string;
  readonly tenantId: string;
  readonly make: string;
  readonly model: string;
  readonly year: number | null;
  readonly allyPrice: number | null;
  readonly minPrice: number | null;
  readonly status: string;
  readonly viewsCount: number;
  readonly visibilityTier: VisibilityTier;
  readonly tenantName: string | null;
  readonly contactPhone: string | null;
}

/**
 * Reads every vehicle the caller's tenant can currently see through
 * `vehicle_snapshots_public` -- routes/catalogo.tsx's "Catálogo" page,
 * browsing the whole visible network rather than just one tenant's
 * inventory. Deliberately has NO `.eq("tenant_id", ...)` filter: the view's
 * own row-filter (`where app.visibility_tier(v.tenant_id) <> 'none'`, see
 * 0004_public_views.sql) already scopes the result set to exactly what the
 * caller is allowed to see -- the caller's own rows at `owner` tier,
 * connected tenants' rows at `connected` tier (real tenant_name/contact_phone),
 * and candidate-tier rows with tenant_name/contact_phone already nulled out
 * by the view itself. Adding a tenant_id filter here would defeat the whole
 * point of this query. Returns an empty array on error, same convention as
 * every other fetch* in this file.
 */
export async function fetchVisibleVehicles(): Promise<VisibleVehicle[]> {
  const { data, error } = await supabaseClient
    .from("vehicle_snapshots_public")
    .select(
      "id, tenant_id, make, model, year, ally_price, min_price, status, views_count, visibility_tier, tenant_name, contact_phone",
    );

  if (error || !data) {
    return [];
  }

  return data.map((row) => ({
    id: row.id,
    tenantId: row.tenant_id,
    make: row.make,
    model: row.model,
    year: row.year,
    allyPrice: row.ally_price,
    minPrice: row.min_price,
    status: row.status,
    viewsCount: row.views_count,
    visibilityTier: row.visibility_tier,
    tenantName: row.tenant_name,
    contactPhone: row.contact_phone,
  }));
}

export interface VehiclePhoto {
  readonly id: string;
  readonly url: string;
  readonly position: number;
}

/**
 * Reads a single vehicle snapshot's photos, ordered for gallery display --
 * routes/catalogo.$vehicleId.tsx's detail page. `vehicle_snapshot_photos`
 * has its own RLS policy (select_visible_vehicle_snapshot_photos,
 * 0003_rls_policies.sql) mirroring the parent snapshot's own visibility via
 * `app.vehicle_snapshot_visible()` -- no `vehicle_snapshots_public` join
 * needed here, this table can be queried directly. Currently always empty
 * in this sandbox (no photos were ever seeded) -- callers must render an
 * honest empty/placeholder state, not assume rows exist. Returns an empty
 * array on error, same read convention as every other fetch* in this file.
 */
export async function fetchVehiclePhotos(vehicleSnapshotId: string): Promise<VehiclePhoto[]> {
  const { data, error } = await supabaseClient
    .from("vehicle_snapshot_photos")
    .select("id, url, position")
    .eq("vehicle_snapshot_id", vehicleSnapshotId)
    .order("position");

  if (error || !data) {
    return [];
  }

  return data.map((row) => ({
    id: row.id,
    url: row.url,
    position: row.position,
  }));
}
