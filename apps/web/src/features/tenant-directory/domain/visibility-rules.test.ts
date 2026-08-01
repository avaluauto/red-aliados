import { describe, expect, it } from "vitest";
import { isContactRevealed, isReputationVisible } from "./visibility-rules";

describe("isContactRevealed", () => {
  // Contact Reveal Gated by Acceptance (tenant-directory spec): phone/
  // WhatsApp is revealed only once a mutual connection is ACCEPTED. Never for
  // 'candidate' (still suggested/pending) or 'none'.
  it.each([
    ["owner", true],
    ["connected", true],
    ["candidate", false],
    ["none", false],
  ] as const)("tier '%s' -> contact revealed: %s", (tier, expected) => {
    expect(isContactRevealed(tier)).toBe(expected);
  });
});

describe("isReputationVisible", () => {
  // Reputation Visible Pre-Connection (tenant-directory spec): reputation is
  // visible whenever a suggested/pending linking row or an active connection
  // links the two tenants -- i.e. any tier other than 'none'. Never for
  // 'none' (no linking row at all -- "no open directory browsing").
  it.each([
    ["owner", true],
    ["connected", true],
    ["candidate", true],
    ["none", false],
  ] as const)("tier '%s' -> reputation visible: %s", (tier, expected) => {
    expect(isReputationVisible(tier)).toBe(expected);
  });
});
