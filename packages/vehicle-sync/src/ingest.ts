import { vehicleSyncEventSchema } from "@red-aliados/contracts/zod";
import { type ApplyNewEventResult, applyNewEvent } from "./apply-event";
import { verifyWebhookSignature } from "./hmac";
import type { SyncStore } from "./store";

export interface IngestRequest {
  /** Exact raw request body bytes (as a string) -- MUST be unparsed, signature verification depends on it. */
  rawBody: string;
  /** Value of the `X-Signature` request header, or `null` if absent. */
  signatureHeader: string | null;
}

export interface IngestDeps {
  store: SyncStore;
  /** `VEHICLE_SYNC_WEBHOOK_SECRET` -- see hmac.ts for the exact signing contract. */
  secret: string;
}

export type IngestResult =
  | ApplyNewEventResult
  | { outcome: "invalid_signature" }
  | { outcome: "invalid_payload"; issues: string[] };

/**
 * `supabase/functions/ingest-vehicle-event`'s testable core (see
 * spec/vehicle-sync: "Outbox Ingestion"). The Deno entrypoint
 * (supabase/functions/ingest-vehicle-event/index.ts) is a thin
 * `Deno.serve` wrapper around this function -- everything here is plain
 * TS with zero Deno-specific globals, so it runs identically under Vitest.
 */
export async function handleIngestVehicleEvent(
  req: IngestRequest,
  deps: IngestDeps,
): Promise<IngestResult> {
  const signatureValid = await verifyWebhookSignature(
    req.rawBody,
    req.signatureHeader,
    deps.secret,
  );
  if (!signatureValid) {
    return { outcome: "invalid_signature" };
  }

  let json: unknown;
  try {
    json = JSON.parse(req.rawBody);
  } catch {
    return { outcome: "invalid_payload", issues: ["request body is not valid JSON"] };
  }

  const parsed = vehicleSyncEventSchema.safeParse(json);
  if (!parsed.success) {
    return {
      outcome: "invalid_payload",
      issues: parsed.error.issues.map((issue) => issue.message),
    };
  }

  return applyNewEvent(parsed.data, deps.store);
}
