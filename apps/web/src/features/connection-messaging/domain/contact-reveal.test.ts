import { describe, expect, it } from "vitest";
import { isMessagingContactRevealed } from "./contact-reveal";

describe("isMessagingContactRevealed", () => {
  // Contact Reveal Only on Acceptance (connection-messaging spec): the
  // counterpart's phone/WhatsApp stays hidden for every status except
  // 'accepted' -- mirrors tenant-directory's isContactRevealed(tier) verdict
  // for 'connected'/'owner' vs. 'candidate'/'none', but expressed directly
  // against the originating connection_requests row's own status since a
  // thread is scoped 1:1 to a single request (see network-connections/
  // domain/connection-lifecycle.ts's ConnectionRequestStatus), not an
  // arbitrary tenant-pair tier.
  it.each([
    ["suggested", false],
    ["pending", false],
    ["accepted", true],
    ["rejected", false],
    ["expired", false],
  ] as const)("status '%s' -> contact revealed: %s", (status, expected) => {
    expect(isMessagingContactRevealed(status)).toBe(expected);
  });
});
