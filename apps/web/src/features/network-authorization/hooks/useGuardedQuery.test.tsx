import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useGuardedQuery } from "./useGuardedQuery";

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe("useGuardedQuery", () => {
  let queryFn: ReturnType<typeof vi.fn<() => Promise<{ secret: string }>>>;

  beforeEach(() => {
    queryFn = vi.fn(async () => ({ secret: "cross-tenant-data" }));
  });

  it("never attempts the query when tier is 'none'", async () => {
    const { result } = renderHook(
      () => useGuardedQuery("none", { queryKey: ["guarded-test", "none"], queryFn }),
      { wrapper },
    );

    // Give any accidental async fetch a chance to fire before asserting.
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(queryFn).not.toHaveBeenCalled();
    expect(result.current.fetchStatus).toBe("idle");
    expect(result.current.data).toBeUndefined();
  });

  it.each(["owner", "connected", "candidate"] as const)(
    "attempts the query when tier is '%s'",
    async (tier) => {
      const { result } = renderHook(
        () => useGuardedQuery(tier, { queryKey: ["guarded-test", tier], queryFn }),
        { wrapper },
      );

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(queryFn).toHaveBeenCalledTimes(1);
      expect(result.current.data).toEqual({ secret: "cross-tenant-data" });
    },
  );

  it("still respects an explicit enabled:false even when the tier allows access", async () => {
    const { result } = renderHook(
      () =>
        useGuardedQuery("connected", {
          queryKey: ["guarded-test", "explicit-disabled"],
          queryFn,
          enabled: false,
        }),
      { wrapper },
    );

    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(queryFn).not.toHaveBeenCalled();
    expect(result.current.fetchStatus).toBe("idle");
  });
});
