import { describe, expect, it } from "vitest";
import { formatRelativeTime } from "./relative-time";

const NOW = new Date("2026-08-03T12:00:00.000Z");

describe("formatRelativeTime", () => {
  it("shows 'Hace instantes' for anything under a minute", () => {
    expect(formatRelativeTime("2026-08-03T11:59:30.000Z", NOW)).toBe("Hace instantes");
  });

  it("shows minutes for anything under an hour", () => {
    expect(formatRelativeTime("2026-08-03T11:45:00.000Z", NOW)).toBe("Hace 15min");
  });

  it("shows hours for anything under a day", () => {
    expect(formatRelativeTime("2026-08-03T09:00:00.000Z", NOW)).toBe("Hace 3h");
  });

  it("shows singular 'Hace 1 día' for exactly one day", () => {
    expect(formatRelativeTime("2026-08-02T12:00:00.000Z", NOW)).toBe("Hace 1 día");
  });

  it("shows plural days for more than one day", () => {
    expect(formatRelativeTime("2026-07-30T12:00:00.000Z", NOW)).toBe("Hace 4 días");
  });

  it("clamps a future date to 'Hace instantes' instead of a negative duration", () => {
    expect(formatRelativeTime("2026-08-03T13:00:00.000Z", NOW)).toBe("Hace instantes");
  });
});
