import { beforeEach, describe, expect, it, vi } from "vitest";

const getClaims = vi.fn();
const onAuthStateChange = vi.fn();
const unsubscribe = vi.fn();

vi.mock("./supabase-client", () => ({
  supabaseClient: {
    auth: {
      getClaims,
      onAuthStateChange,
    },
  },
}));

describe("fetchSessionResult", () => {
  beforeEach(() => {
    vi.resetModules();
    getClaims.mockReset();
    onAuthStateChange.mockReset();
    unsubscribe.mockReset();
    // biome-ignore lint/suspicious/noExplicitAny: test-only global seam cleanup
    delete (globalThis as any).__RED_ALIADOS_E2E_SESSION__;
  });

  it("returns authenticated with the raw claims when getClaims succeeds", async () => {
    getClaims.mockResolvedValue({
      data: { claims: { tenant_id: "t-1", role: "dealer_admin", red_aliados_enabled: true } },
      error: null,
    });

    const { fetchSessionResult } = await import("./session");
    const result = await fetchSessionResult();

    expect(result).toEqual({
      status: "authenticated",
      rawClaims: { tenant_id: "t-1", role: "dealer_admin", red_aliados_enabled: true },
    });
  });

  it("returns unauthenticated when getClaims errors", async () => {
    getClaims.mockResolvedValue({ data: null, error: new Error("jwt invalid") });

    const { fetchSessionResult } = await import("./session");
    const result = await fetchSessionResult();

    expect(result).toEqual({ status: "unauthenticated" });
  });

  it("returns unauthenticated when there is no session at all", async () => {
    getClaims.mockResolvedValue({ data: null, error: null });

    const { fetchSessionResult } = await import("./session");
    const result = await fetchSessionResult();

    expect(result).toEqual({ status: "unauthenticated" });
  });

  it("never writes anything -- it only ever reads from the Supabase client", async () => {
    getClaims.mockResolvedValue({
      data: { claims: { tenant_id: "t-1", role: "dealer_admin", red_aliados_enabled: true } },
      error: null,
    });

    const { fetchSessionResult } = await import("./session");
    await fetchSessionResult();

    expect(getClaims).toHaveBeenCalledTimes(1);
  });
});

describe("subscribeToAuthChanges", () => {
  beforeEach(() => {
    vi.resetModules();
    getClaims.mockReset();
    onAuthStateChange.mockReset();
    unsubscribe.mockReset();
    onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe } } });
  });

  it("subscribes via the Supabase client and invokes the callback on change", async () => {
    const { subscribeToAuthChanges } = await import("./session");
    const onChange = vi.fn();

    subscribeToAuthChanges(onChange);

    expect(onAuthStateChange).toHaveBeenCalledTimes(1);
    const registeredCallback = onAuthStateChange.mock.calls[0]?.[0] as () => void;
    registeredCallback();
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("returns an unsubscribe function that tears down the Supabase subscription", async () => {
    const { subscribeToAuthChanges } = await import("./session");
    const teardown = subscribeToAuthChanges(vi.fn());

    teardown();

    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});
