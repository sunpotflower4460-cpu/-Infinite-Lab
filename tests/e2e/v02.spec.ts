import { readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'

/** Digest of π Digit Circle Walk after 1,000 steps, pinned by tests/unit/renderer/geometryStore.test.ts (Node). */
const PINNED_1000 = 'fb95870d0cff6d0c7913adf09bc10f041a593f29f7a1debe29f3bb2e8edd1d38'

async function ready(page: Page, text = '3.14159') {
  await expect(page.getByTestId('digit-stream')).toContainText(text)
}

async function gotoStep(page: Page, n: number) {
  await page.getByLabel('Go to step').fill(String(n))
  await page.getByLabel('Go to step').press('Enter')
}

test('constants: e, √2, φ are computed and drive the experiment', async ({ page }) => {
  await page.goto('/')
  await ready(page)
  for (const [id, prefix, first] of [
    ['e', '2.71828182845904', '2'],
    ['sqrt2', '1.41421356237309', '1'],
    ['phi', '1.61803398874989', '1'],
  ] as const) {
    await page.getByTestId('constant').selectOption(id)
    await ready(page, prefix)
    await page.getByRole('button', { name: 'Step' }).click()
    await expect(page.getByTestId('current-digit')).toHaveText(first)
  }
})

test('experiments: Circle Chain and Pi Rotation show their executed formulas', async ({ page }) => {
  await page.goto('/')
  await ready(page)
  await page.getByLabel('Experiment').selectOption('circle-chain')
  await expect(page.getByTestId('formulas-current')).toContainText(
    'θ[n] = (cumulative × θ[n−1] + digit / 10 × 2π) mod 2π',
  )
  await page.getByLabel('Experiment').selectOption('pi-rotation')
  await expect(page.getByTestId('formulas-current')).toContainText('φ[n]° = (n × modifier × π) mod 360')
  await page.getByRole('button', { name: 'Step' }).click()
  await page.getByRole('button', { name: 'Step' }).click()
  await expect(page.getByTestId('inspector')).toContainText('(2 × 1 × π) mod 360')
  await expect(page.getByTestId('inspector')).toContainText('6.283185307179586')
})

test('timeline: look back, return, and compute forward', async ({ page }) => {
  await page.goto('/')
  await ready(page)
  await gotoStep(page, 500) // forward: computes 500 steps
  await expect(page.getByTestId('current-step')).toHaveText('500')
  await gotoStep(page, 6) // back: view only
  await expect(page.getByTestId('timeline')).toContainText('viewing')
  await expect(page.getByTestId('inspector-step')).toHaveText('6')
  await expect(page.getByTestId('current-step')).toHaveText('500') // nothing was recomputed or discarded
  await expect(page.getByTestId('digit-stream')).toContainText('5th decimal place')
  await page.getByRole('button', { name: 'Latest' }).click()
  await expect(page.getByTestId('timeline')).not.toContainText('viewing')
})

test('click on the canvas inspects the geometry under the cursor', async ({ page }) => {
  await page.goto('/')
  await ready(page)
  await page.getByLabel('Experiment').selectOption('circle-chain')
  await page.getByRole('button', { name: 'Step' }).click() // circle 1: centre (0,0), r = 6 — fit centres it
  await expect(page.getByTestId('current-step')).toHaveText('1')
  const box = (await page.getByTestId('lab-canvas').boundingBox())!
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
  await expect(page.getByTestId('inspector')).toContainText('pinned')
  await page.getByRole('button', { name: 'Step' }).click()
  await expect(page.getByTestId('current-step')).toHaveText('2')
  await expect(page.getByTestId('inspector-step')).toHaveText('1') // stays on the clicked step
})

test('presets configure constant, precision and experiment', async ({ page }) => {
  await page.goto('/')
  await ready(page)
  await page.getByTestId('preset').selectOption('pi-orbit')
  await expect(page.getByLabel('Experiment')).toHaveValue('pi-rotation')
  await expect(page.getByTestId('precision')).toHaveValue('100000')
  await ready(page)
  await expect(page.getByLabel('MODIFIER')).toHaveValue('1')
})

test('export → import reproduces the geometry bit-for-bit (and the browser matches Node)', async ({
  page,
}) => {
  await page.goto('/')
  await ready(page)
  await gotoStep(page, 1000)
  await expect(page.getByTestId('current-step')).toHaveText('1,000')
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Export JSON' }).click(),
  ])
  const path = await download.path()
  const file = JSON.parse(readFileSync(path, 'utf8'))
  expect(file.format).toBe('pi-infinite-lab/experiment')
  expect(file.steps).toBe(1000)
  expect(file.result.geometrySha256).toBe(PINNED_1000) // browser pipeline == Node pipeline
  expect(file.formulas[0]).toBe('angle = digit / 10 × 2π')

  // change everything, then import: it must recompute and verify
  await page.getByLabel('Experiment').selectOption('circle-chain')
  await page.getByTestId('import-file').setInputFiles({
    name: 'x.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(file)),
  })
  await expect(page.getByTestId('verify')).toContainText('reproduced')
  await expect(page.getByLabel('Experiment')).toHaveValue('digit-circle-walk')
  await expect(page.getByTestId('current-step')).toHaveText('1,000')

  // a tampered digest is reported, not hidden
  const tampered = { ...file, result: { ...file.result, geometrySha256: '0'.repeat(64) } }
  await page.getByTestId('import-file').setInputFiles({
    name: 't.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(tampered)),
  })
  await expect(page.getByTestId('verify')).toContainText('differs')

  // invalid files are rejected with a reason
  await page.getByTestId('import-file').setInputFiles({
    name: 'b.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"experiment":"nope"}'),
  })
  await expect(page.getByTestId('verify')).toContainText('unknown experiment')
})

test('history: save, restore with verification, delete', async ({ page }) => {
  await page.goto('/')
  await ready(page)
  await page.getByLabel('Experiment').selectOption('pi-rotation')
  await gotoStep(page, 300)
  await expect(page.getByTestId('current-step')).toHaveText('300')
  await page.getByRole('button', { name: 'Save current state' }).click()
  await expect(page.getByTestId('history')).toContainText('300 steps')

  await page.reload() // persisted in localStorage
  await ready(page)
  await page
    .getByTestId('history')
    .getByRole('button', { name: /Pi Rotation/ })
    .click()
  await expect(page.getByTestId('verify')).toContainText('reproduced')
  await expect(page.getByTestId('current-step')).toHaveText('300')
  await page.getByTestId('history').getByRole('button', { name: 'Delete' }).click()
  await expect(page.getByTestId('history')).not.toContainText('300 steps')
})

test('canvas keeps the host size after layout changes (camera and pixels agree)', async ({ page }) => {
  await page.goto('/')
  await ready(page)
  await page.getByRole('button', { name: 'Step' }).click()
  await page
    .getByRole('button', { name: 'Scientific Mode' })
    .or(page.getByText('Scientific Mode'))
    .first()
    .click()
  await page.setViewportSize({ width: 1100, height: 700 })
  await expect
    .poll(() =>
      page.evaluate(() => {
        const c = document.querySelector('[data-testid=lab-canvas]') as HTMLCanvasElement
        return [c.clientWidth - c.parentElement!.clientWidth, c.clientHeight - c.parentElement!.clientHeight]
      }),
    )
    .toEqual([0, 0])
})
