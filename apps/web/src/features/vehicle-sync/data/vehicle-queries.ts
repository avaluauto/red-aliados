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
