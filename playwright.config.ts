import { defineConfig } from "@playwright/test";

// Was referenced by the plan's repo layout and the `e2e` script but never
// created — minimal config: serial-ish runs against a dev server on :3000.
export default defineConfig({
  testDir: "./tests/e2e",
  // 2-core/low-RAM dev box: cold `next dev` boot + first route compile can
  // exceed 60s (observed Ready-in-47s + /admin-in-20s).
  timeout: 120_000,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [{
    name: "chromium",
    // Full chromium-1243 is already installed; the chrome-headless-shell
    // build for 1.63 is not, and we don't download browsers in this env.
    use: { browserName: "chromium", channel: "chromium" },
  }],
  webServer: {
    command: "pnpm dev",
    // `port` (TCP connect) rather than `url`: `/` 307-redirects to /login,
    // which 404s until Task 19, so an HTTP probe would never see 2xx.
    port: 3000,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
