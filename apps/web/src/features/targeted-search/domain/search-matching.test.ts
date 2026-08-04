import { describe, expect, it } from "vitest";
import { filterConnectedFanOutTargets, orderMatchesOwnInventoryFirst } from "./search-matching";

describe("orderMatchesOwnInventoryFirst", () => {
  // Own-Inventory-First Search (targeted-search spec): "the own-inventory
  // match is shown before any network option is presented". A stable sort
  // by source, own_inventory first -- never re-orders within either group.
  it("moves every own_inventory match ahead of every network match, preserving relative order within each group", () => {
    const matches = [
      { id: "n1", source: "network" as const },
      { id: "o1", source: "own_inventory" as const },
      { id: "n2", source: "network" as const },
      { id: "o2", source: "own_inventory" as const },
    ];

    expect(orderMatchesOwnInventoryFirst(matches).map((m) => m.id)).toEqual([
      "o1",
      "o2",
      "n1",
      "n2",
    ]);
  });

  it("returns an empty array unchanged", () => {
    expect(orderMatchesOwnInventoryFirst([])).toEqual([]);
  });

  it("is a no-op when every match is already own_inventory", () => {
    const matches = [
      { id: "o1", source: "own_inventory" as const },
      { id: "o2", source: "own_inventory" as const },
    ];
    expect(orderMatchesOwnInventoryFirst(matches).map((m) => m.id)).toEqual(["o1", "o2"]);
  });

  it("does not mutate the input array", () => {
    const matches = [
      { id: "n1", source: "network" as const },
      { id: "o1", source: "own_inventory" as const },
    ];
    const copy = [...matches];
    orderMatchesOwnInventoryFirst(matches);
    expect(matches).toEqual(copy);
  });
});

describe("filterConnectedFanOutTargets", () => {
  const TENANT_B = "22222222-2222-4222-8222-222222222222";
  const TENANT_C = "33333333-3333-4333-8333-333333333333";
  const TENANT_D = "44444444-4444-4444-8444-444444444444";

  // Opt-In Fan-Out to Connected Tenants Only (targeted-search spec): "MUST
  // restrict that fan-out to tenants with an active mutual connection ...
  // Unconnected tenants' vehicles MUST NOT appear." This mirrors the DB's
  // own gate -- insert_own_search_request_targets (0003_rls_policies.sql)
  // requires app.is_connected(target_tenant_id) -- as a client-side
  // defense-in-depth check, same pattern network-authorization's client
  // guard established.
  it("keeps only candidate tenants present in the connected set", () => {
    const result = filterConnectedFanOutTargets(
      [TENANT_B, TENANT_C, TENANT_D],
      [TENANT_B, TENANT_D],
    );
    expect(result).toEqual([TENANT_B, TENANT_D]);
  });

  it("excludes a tenant with no active connection even if it was a candidate", () => {
    const result = filterConnectedFanOutTargets([TENANT_C], [TENANT_B, TENANT_D]);
    expect(result).toEqual([]);
  });

  it("returns an empty array when there are no connected tenants at all", () => {
    expect(filterConnectedFanOutTargets([TENANT_B, TENANT_C], [])).toEqual([]);
  });

  it("never platform-wide: an empty candidate list yields an empty result regardless of connections", () => {
    expect(filterConnectedFanOutTargets([], [TENANT_B, TENANT_C, TENANT_D])).toEqual([]);
  });
});
