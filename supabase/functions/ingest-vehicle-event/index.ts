// Deno entrypoint for the V2 -> Red Aliados vehicle-sync webhook (spec:
// vehicle-sync "Outbox Ingestion"). Thin `Deno.serve` wrapper — all real
// logic lives in @red-aliados/vehicle-sync (packages/vehicle-sync), a
// normal pnpm package with a real, executed Vitest suite. See
// supabase/functions/README.md for what was/wasn't verified in this PR.
//
// Signature contract (see packages/vehicle-sync/src/hmac.ts for the exact
// algorithm): header `X-Signature: sha256=<hex hmac-sha256 of the raw
// body>`, secret from the `VEHICLE_SYNC_WEBHOOK_SECRET` env var
// (`supabase secrets set VEHICLE_SYNC_WEBHOOK_SECRET=...` once a real
// project exists — NOT configured anywhere in this sandbox).
//
// `[functions.ingest-vehicle-event] verify_jwt = false` in
// supabase/config.toml — this endpoint authenticates via HMAC signature,
// not a Supabase JWT (V2's outbox dispatcher is not a Red-Aliados-federated
// user).

import { handleIngestVehicleEvent } from "../../../packages/vehicle-sync/src/index.ts";
import { SupabaseSyncStore } from "../_shared/supabase-sync-store.ts";

const store = new SupabaseSyncStore(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
);
const secret = Deno.env.get("VEHICLE_SYNC_WEBHOOK_SECRET") ?? "";

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const rawBody = await req.text();
  const result = await handleIngestVehicleEvent(
    { rawBody, signatureHeader: req.headers.get("X-Signature") },
    { store, secret },
  );

  switch (result.outcome) {
    case "invalid_signature":
      return new Response(JSON.stringify({ error: "invalid signature" }), { status: 401 });
    case "invalid_payload":
      return new Response(JSON.stringify({ error: "invalid payload", issues: result.issues }), {
        status: 400,
      });
    case "duplicate":
      // Idempotent no-op — already processed. 200, not an error.
      return new Response(JSON.stringify({ status: "duplicate" }), { status: 200 });
    case "skipped_stale":
      return new Response(
        JSON.stringify({ status: "skipped_stale", eventLogId: result.eventLogId }),
        {
          status: 200,
        },
      );
    case "applied":
      return new Response(JSON.stringify({ status: "applied", eventLogId: result.eventLogId }), {
        status: 200,
      });
    case "failed":
      // Logged as 'failed' with a scheduled retry via reconcile-outbox — a
      // 500 here is honest (we did not apply the event) and lets V2's own
      // webhook-delivery retry logic (if any) also have a chance, on top
      // of our own backoff-driven retry-drain.
      return new Response(JSON.stringify({ error: result.error }), { status: 500 });
  }
});
