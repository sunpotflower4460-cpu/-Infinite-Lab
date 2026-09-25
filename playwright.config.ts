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

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  use: {
    baseURL: 'http://localhost:4173',
    ...devices['Desktop Chrome'],
    launchOptions: executablePath ? { executablePath } : {},
  },
  webServer: {
    command: 'npm run build && npm run preview -- --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
})
