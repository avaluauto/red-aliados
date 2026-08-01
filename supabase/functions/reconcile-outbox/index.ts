// Deno entrypoint for the reconciliation backstop (spec: vehicle-sync
// "Reconciliation Backstop"). Invoked on a schedule by pg_cron + pg_net
// (supabase/migrations/0005_pg_cron_reconcile.sql), every 15 minutes.
// Thin `Deno.serve` wrapper — all real logic lives in
// @red-aliados/vehicle-sync (packages/vehicle-sync), a normal pnpm package
// with a real, executed Vitest suite (see integration.test.ts for the
// gap-scan repair scenario). See supabase/functions/README.md for what
// was/wasn't verified in this PR.
//
// `[functions.reconcile-outbox] verify_jwt = false` in
// supabase/config.toml — invoked internally by pg_net with a bearer token
// this function itself checks against `RECONCILE_OUTBOX_SECRET` (a second,
// distinct shared secret from the webhook's -- this endpoint has no
// external caller at all, so JWT verification would need to accept
// Postgres's own service-role token, which `verify_jwt` doesn't
// cleanly support for pg_net-originated calls; a static bearer check is
// the documented, simplest correct alternative).
//
// Assumed V2 outbox pull contract (undocumented anywhere real — see
// packages/vehicle-sync/src/reconcile.ts's `FetchOutboxSince` doc comment
// for the exact assumed shape):
//   GET {V2_OUTBOX_BASE_URL}/outbox?aggregate_type=vehicle&since=<seq>
//   Header: Authorization: Bearer {V2_OUTBOX_API_KEY}

import { vehicleSyncEventSchema } from "../../../packages/contracts/src/zod/index.ts";
import { runReconcileOutbox } from "../../../packages/vehicle-sync/src/index.ts";
import { SupabaseSyncStore } from "../_shared/supabase-sync-store.ts";

const store = new SupabaseSyncStore(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
);
const reconcileSecret = Deno.env.get("RECONCILE_OUTBOX_SECRET") ?? "";
const v2OutboxBaseUrl = Deno.env.get("V2_OUTBOX_BASE_URL") ?? "";
const v2OutboxApiKey = Deno.env.get("V2_OUTBOX_API_KEY") ?? "";

async function fetchOutboxSince(sinceSeq: number) {
  const url = `${v2OutboxBaseUrl}/outbox?aggregate_type=vehicle&since=${sinceSeq}`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${v2OutboxApiKey}` },
  });
  if (!response.ok) {
    throw new Error(`V2 outbox gap-scan request failed: ${response.status} ${response.statusText}`);
  }
  const body = (await response.json()) as unknown[];
  return body.map((raw) => vehicleSyncEventSchema.parse(raw));
}

Deno.serve(async (req: Request) => {
  const auth = req.headers.get("Authorization");
  if (auth !== `Bearer ${reconcileSecret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const result = await runReconcileOutbox({ store, fetchOutboxSince });
  return new Response(JSON.stringify(result), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
});
