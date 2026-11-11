// Browser tests (tests/pages.spec.ts): the built app in headless Chromium against a made-up mailbag
// (tests/fixtures.ts), no backend. CI runs them in Playwright's own container image, and the approved
// screenshots are made in that same image (README, Browser tests), so a pixel means the same thing on
// every run. Keep the image's version in .github/workflows/pages.yml in step with @playwright/test.
import { defineConfig, devices } from "@playwright/test";

const PORT = 4173;

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : [["list"]],
  // One set of approved screenshots, whatever machine made them: only the CI image's count.
  snapshotPathTemplate: "{testDir}/__screenshots__/{arg}{ext}",
  expect: {
    // Room for a cold start: the first page a freshly launched browser loads can take a few seconds.
    timeout: 10_000,
    // Text rendering can differ by a hair between runs; a real change moves far more than this.
    toHaveScreenshot: { maxDiffPixelRatio: 0.002, animations: "disabled" },
  },
  use: {
    baseURL: `http://127.0.0.1:${PORT}/wpr-santa-letters/`,
    trace: "retain-on-failure",
  },
  // Chrome's engine, and Safari's: most parents will open this on an iPhone. The approved screenshots are
  // Chrome's; in Safari's engine the same tests check what's on the page and how it's laid out
  // (pages.spec.ts's `shot`), since its text renders differently enough to need a second set.
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
  webServer: {
    // The real build (type-check included), with stand-in addresses: every request the app makes to
    // them is answered by the tests.
    command: `npm run build && npx vite preview --port ${PORT} --strictPort --host 127.0.0.1`,
    url: `http://127.0.0.1:${PORT}/wpr-santa-letters/`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      VITE_SUPABASE_URL: "https://backend.test",
      VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
      VITE_MAILBAG_PAGE_URL: "https://wausaupilotandreview.com/letters-to-santa/",
      VITE_WRITE_PAGE_URL: "https://wausaupilotandreview.com/letters-to-santa/#write",
      VITE_RULES_URL: "https://wausaupilotandreview.com/letters-to-santa-rules/",
      VITE_TURNSTILE_SITE_KEY: "1x00000000000000000000AA",
    },
  },
});
