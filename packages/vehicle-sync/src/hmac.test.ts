import { describe, expect, it } from "vitest";
import { signWebhookBody, verifyWebhookSignature } from "./hmac";

const SECRET = "test-shared-secret";
const BODY = JSON.stringify({ hello: "world", n: 1 });

describe("verifyWebhookSignature", () => {
  it("accepts a signature produced with the correct secret over the exact raw body", async () => {
    const signature = await signWebhookBody(BODY, SECRET);

    const valid = await verifyWebhookSignature(BODY, signature, SECRET);

    expect(valid).toBe(true);
  });

  it("rejects when the header is missing", async () => {
    const valid = await verifyWebhookSignature(BODY, null, SECRET);

    expect(valid).toBe(false);
  });

  it("rejects when the header is missing the required 'sha256=' prefix", async () => {
    const signature = await signWebhookBody(BODY, SECRET);
    const rawHex = signature.replace("sha256=", "");

    const valid = await verifyWebhookSignature(BODY, rawHex, SECRET);

    expect(valid).toBe(false);
  });

  it("rejects when the body was tampered with after signing", async () => {
    const signature = await signWebhookBody(BODY, SECRET);

    const valid = await verifyWebhookSignature(`${BODY}x`, signature, SECRET);

    expect(valid).toBe(false);
  });

  it("rejects when signed with the wrong secret", async () => {
    const signature = await signWebhookBody(BODY, "a-different-secret");

    const valid = await verifyWebhookSignature(BODY, signature, SECRET);

    expect(valid).toBe(false);
  });

  it("rejects a malformed (non-hex) signature value without throwing", async () => {
    const valid = await verifyWebhookSignature(BODY, "sha256=not-hex-!!", SECRET);

    expect(valid).toBe(false);
  });

  it("rejects a syntactically valid but wrong-length hex signature without throwing", async () => {
    const valid = await verifyWebhookSignature(BODY, "sha256=abcd", SECRET);

    expect(valid).toBe(false);
  });
});
