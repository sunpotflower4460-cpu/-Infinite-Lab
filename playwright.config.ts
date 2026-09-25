import { statSync } from 'node:fs'
import { join } from 'node:path'
import { defineConfig, devices } from '@playwright/test'

// Prefer an explicitly given Chromium, or a pre-installed one next to the browsers path whose
// revision may differ from this Playwright version (e.g. cloud containers). Otherwise use
// Playwright's own managed browser.
const preinstalled = process.env.PLAYWRIGHT_BROWSERS_PATH
  ? join(process.env.PLAYWRIGHT_BROWSERS_PATH, 'chromium')
  : undefined
const executablePath =
  process.env.PLAYWRIGHT_CHROMIUM_PATH ??
  (preinstalled && statSync(preinstalled, { throwIfNoEntry: false })?.isFile() ? preinstalled : undefined)

/**
 * Chromium always; Firefox and WebKit (Safari's engine) when PW_ALL_BROWSERS is set (CI).
 * Running the same suite on three engines checks that the geometry digest is identical
 * across JavaScript engines — the determinism guarantee, not just V8's behaviour.
 */
const all = !!process.env.PW_ALL_BROWSERS

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  use: { baseURL: 'http://localhost:4173' },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], launchOptions: executablePath ? { executablePath } : {} },
    },
    ...(all
      ? [
          { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
          { name: 'webkit', use: { ...devices['Desktop Safari'] } },
        ]
      : []),
  ],
  webServer: {
    command: 'npm run build && npm run preview -- --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
})
