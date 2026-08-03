// HMAC signature verification for the V2 -> Red Aliados webhook.
//
// Contract (documented here since there is no live V2 project to verify
// against — see supabase/THIRD_PARTY_AUTH.md for the same pattern used in
// PR2):
//   - Header name: `X-Signature`
//   - Header value shape: `sha256=<lowercase-hex-hmac-sha256-digest>`
//   - Digest is computed over the EXACT raw request body bytes (UTF-8),
//     BEFORE any JSON parsing — signature verification MUST happen first,
//     against the untouched body string, or a byte-identical re-serialization
//     bug could silently break verification.
//   - Shared secret is a single static value, provisioned out of band and
//     read from the `VEHICLE_SYNC_WEBHOOK_SECRET` environment variable at
//     the Edge Function boundary (see supabase/functions/ingest-vehicle-event).
//
// Uses Web Crypto (`crypto.subtle`), available natively in both the Deno
// Edge Runtime (production) and Node >= 19 (this package's Vitest suite) —
// no polyfill, no runtime-specific branching.

const SIGNATURE_PREFIX = "sha256=";

function toHex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function fromHex(hex: string): Uint8Array | null {
  if (hex.length === 0 || hex.length % 2 !== 0 || !/^[0-9a-f]+$/i.test(hex)) {
    return null;
  }

  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/** Constant-time comparison — avoids leaking digest match length via early return timing. */
function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) {
    return false;
  }

  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    // biome-ignore lint/style/noNonNullAssertion: loop bound is a.length, index is always in range
    diff |= a[i]! ^ b[i]!;
  }
  return diff === 0;
}

async function hmacSha256Digest(rawBody: string, secret: string): Promise<ArrayBuffer> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
}

/** Signs a raw body, producing the exact `X-Signature` header value a caller should send. */
export async function signWebhookBody(rawBody: string, secret: string): Promise<string> {
  const digest = await hmacSha256Digest(rawBody, secret);
  return `${SIGNATURE_PREFIX}${toHex(digest)}`;
}

/**
 * Verifies the `X-Signature` header against the raw (unparsed) request body.
 * Never throws — malformed input (missing header, non-hex value, wrong
 * length) resolves to `false` rather than propagating an exception, so
 * callers can treat "invalid signature" uniformly.
 */
export async function verifyWebhookSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string,
): Promise<boolean> {
  if (!signatureHeader?.startsWith(SIGNATURE_PREFIX)) {
    return false;
  }

  const providedBytes = fromHex(signatureHeader.slice(SIGNATURE_PREFIX.length));
  if (!providedBytes) {
    return false;
  }

  const expectedDigest = await hmacSha256Digest(rawBody, secret);
  return timingSafeEqual(providedBytes, new Uint8Array(expectedDigest));
}
