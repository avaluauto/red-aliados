import { defineConfig, devices } from "@playwright/test";

const PORT = 4173;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // e2e-mode build: enables the identity-bridge test seam
    // (`window.__RED_ALIADOS_E2E_SESSION__`, see
    // src/features/identity-bridge/data/session.ts) since there is no live
    // Supabase project to sign in against for real yet (task 2.1).
    command: "pnpm build:e2e && pnpm preview --port 4173",
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
