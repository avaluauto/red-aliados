import { describe, expect, it } from "vitest";
import { isModuleEnabled, parseSessionClaims } from "./session-claims";

const VALID_TENANT_ID = "11111111-1111-4111-8111-111111111111";

describe("parseSessionClaims", () => {
  it("accepts a fully-formed claim bag with the module enabled", () => {
    const result = parseSessionClaims({
      tenant_id: VALID_TENANT_ID,
      app_role: "dealer_admin",
      red_aliados_enabled: true,
    });

    expect(result).toEqual({
      valid: true,
      claims: {
        tenantId: VALID_TENANT_ID,
        role: "dealer_admin",
        redAliadosEnabled: true,
      },
    });
  });

  it("accepts a claim bag with the module explicitly disabled", () => {
    const result = parseSessionClaims({
      tenant_id: VALID_TENANT_ID,
      app_role: "dealer_user",
      red_aliados_enabled: false,
    });

    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.claims.redAliadosEnabled).toBe(false);
    }
  });

  it("fails closed to disabled when red_aliados_enabled is absent", () => {
    const result = parseSessionClaims({
      tenant_id: VALID_TENANT_ID,
      app_role: "dealer_user",
    });

    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.claims.redAliadosEnabled).toBe(false);
    }
  });

  it("fails closed to disabled when red_aliados_enabled is not a boolean", () => {
    const result = parseSessionClaims({
      tenant_id: VALID_TENANT_ID,
      app_role: "dealer_user",
      red_aliados_enabled: "true",
    });

    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.claims.redAliadosEnabled).toBe(false);
    }
  });

  it("rejects a claim bag missing tenant_id", () => {
    const result = parseSessionClaims({
      app_role: "dealer_admin",
      red_aliados_enabled: true,
    });

    expect(result.valid).toBe(false);
  });

  it("rejects a claim bag whose tenant_id is not a UUID", () => {
    const result = parseSessionClaims({
      tenant_id: "not-a-uuid",
      app_role: "dealer_admin",
      red_aliados_enabled: true,
    });

    expect(result.valid).toBe(false);
  });

  it("rejects a claim bag missing app_role", () => {
    const result = parseSessionClaims({
      tenant_id: VALID_TENANT_ID,
      red_aliados_enabled: true,
    });

    expect(result.valid).toBe(false);
  });

  it("rejects a non-object payload", () => {
    expect(parseSessionClaims(null).valid).toBe(false);
    expect(parseSessionClaims(undefined).valid).toBe(false);
    expect(parseSessionClaims("nope").valid).toBe(false);
  });
});

describe("isModuleEnabled", () => {
  it("returns true only when redAliadosEnabled is true", () => {
    expect(
      isModuleEnabled({ tenantId: VALID_TENANT_ID, role: "dealer_admin", redAliadosEnabled: true }),
    ).toBe(true);
    expect(
      isModuleEnabled({
        tenantId: VALID_TENANT_ID,
        role: "dealer_admin",
        redAliadosEnabled: false,
      }),
    ).toBe(false);
  });
});
