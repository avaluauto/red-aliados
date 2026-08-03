import { afterEach, describe, expect, it } from "vitest";
import { getAppOrigin, isAppHost } from "./host-mode";

// window.location is read live on every call (see host-mode.ts's own
// comment on why these are functions, not module-level constants), so each
// test stubs location directly and restores the original afterward.
const originalLocation = window.location;

function setLocation(url: string) {
  const parsed = new URL(url);
  Object.defineProperty(window, "location", {
    configurable: true,
    value: parsed,
  });
}

afterEach(() => {
  Object.defineProperty(window, "location", {
    configurable: true,
    value: originalLocation,
  });
});

describe("isAppHost", () => {
  it("is false for the marketing/root host", () => {
    setLocation("http://localhost:5173/");
    expect(isAppHost()).toBe(false);
  });

  it("is true for an app.-prefixed host", () => {
    setLocation("http://app.localhost:5173/login");
    expect(isAppHost()).toBe(true);
  });
});

describe("getAppOrigin", () => {
  it("prefixes app. onto the hostname, preserving protocol and port", () => {
    setLocation("http://localhost:5173/");
    expect(getAppOrigin()).toBe("http://app.localhost:5173");
  });

  it("works with a real-looking production domain and no explicit port", () => {
    setLocation("https://redaliados.com/");
    expect(getAppOrigin()).toBe("https://app.redaliados.com");
  });
});
