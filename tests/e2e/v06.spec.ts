import { readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'

async function ready(page: Page) {
  await expect(page.getByTestId('digit-stream')).toContainText('3.14159')
}

async function goTo(page: Page, step: number) {
  await page.getByLabel('Go to step').fill(String(step))
  await page.getByLabel('Go to step').press('Enter')
  await expect(page.getByTestId('current-step')).toHaveText(step.toLocaleString('en-US'))
}

/** WebGL available in this browser (CI also runs without it: then the 3D view explains itself). */
const hasWebgl = (page: Page) =>
  page.evaluate(() => {
    const c = document.createElement('canvas')
    return !!(c.getContext('webgl2') ?? c.getContext('webgl'))
  })

/** The 3D view is shown — or, without WebGL, the note that the top view is shown instead. */
async function expect3d(page: Page, lanes = 1) {
  if (await hasWebgl(page)) await expect(page.getByTestId('canvas-3d')).toHaveCount(lanes)
  else await expect(page.getByTestId('webgl-missing')).toHaveCount(lanes)
}

const view = (page: Page, name: string) =>
  page.getByRole('group', { name: 'Two-Arm view' }).getByRole('button', { name, exact: true })

test.describe('Two-Arm 3D (v0.6)', () => {
  test('the view switch is there when the lab is opened directly, and starts each view', async ({ page }) => {
    await page.goto('/#lab')
    await ready(page)
    await expect(page.getByLabel('Experiment')).toHaveValue('digit-circle-walk')
    for (const name of ['2D', 'Torus', 'Ball', 'Height']) await expect(view(page, name)).toBeVisible()
    await expect(page.getByRole('button', { name: 'vs 22/7' })).toHaveCount(0) // only for the Two-Arm family

    await view(page, 'Torus').click()
    await expect(page.getByLabel('Experiment')).toHaveValue('two-arm-torus')
    await expect(view(page, 'Torus')).toHaveAttribute('aria-pressed', 'true')
    await expect3d(page)
    await goTo(page, 300)
    await expect(page.getByTestId('inspector')).toContainText('ρ = r1 + r2 × cos(θ₂)')

    // shared parameters carry over; Ball adds the table angle θ₃ = (n × dt × π²) mod 2π
    await view(page, 'Ball').click()
    await expect(page.getByLabel('Experiment')).toHaveValue('two-arm-ball')
    await goTo(page, 10)
    await expect(page.getByTestId('inspector')).toContainText('θ₃ = (n × dt × π²) mod 2π')

    await view(page, '2D').click()
    await expect(page.getByLabel('Experiment')).toHaveValue('two-arm')
    await expect(page.getByTestId('canvas-3d')).toHaveCount(0)
    await expect(page.getByTestId('webgl-missing')).toHaveCount(0)
  })

  test('vs 22/7 runs the same machine with the fraction side by side', async ({ page }) => {
    await page.goto('/#lab')
    await ready(page)
    await view(page, 'Torus').click()
    await page.getByRole('button', { name: 'vs 22/7' }).click()
    await expect(page.getByTestId('lane-readout-1')).toBeVisible()
    await expect(page.getByLabel('Compare constant')).toHaveValue('frac-22-7')
    await expect3d(page, 2)
    await page.getByRole('button', { name: 'vs 22/7' }).click()
    await expect(page.getByTestId('lane-readout-1')).toHaveCount(0)
  })

  test('the 3D view records a video', async ({ page }) => {
    test.setTimeout(120_000)
    await page.goto('/#lab')
    await ready(page)
    const hasEncoder = await page.evaluate(() => typeof VideoEncoder !== 'undefined')
    test.skip(!hasEncoder, 'no WebCodecs encoder in this browser')
    await view(page, 'Ball').click()
    await expect3d(page) // without WebGL the top view is recorded
    await goTo(page, 800)
    await page.getByRole('button', { name: 'Video', exact: true }).click()
    await page.getByLabel('Video length').selectOption('2')
    await page.getByLabel('Video format').selectOption('mp4')
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 90_000 }),
      page.getByRole('button', { name: 'Record' }).click(),
    ])
    expect(download.suggestedFilename()).toBe('pi-infinite-lab_two-arm-ball_pi_800.mp4')
    const bytes = readFileSync(await download.path())
    expect(bytes.subarray(4, 8).toString('latin1')).toBe('ftyp')
    expect(bytes.length).toBeGreaterThan(20_000)
    await expect(page.getByTestId('video-status')).toContainText('saved')
  })
})
