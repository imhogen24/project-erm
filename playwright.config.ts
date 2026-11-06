import { defineConfig, devices } from "@playwright/test"

export default defineConfig({
  testDir: "./e2e",
  // Removes the projects and people the tests make, before and after the run.
  globalSetup: "./e2e/global-cleanup.ts",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      // In CI the database is a service container, so skip the Docker step in `predev`.
      command: process.env.CI ? "bunx next dev --turbopack" : "bun run dev",
      url: "http://localhost:3000/api/auth/ok",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      // A production build on its own port, to check what production hides.
      command: "bun run build && bunx next start -p 3100",
      url: "http://localhost:3100/api/auth/ok",
      reuseExistingServer: !process.env.CI,
      timeout: 240_000,
    },
  ],
})
