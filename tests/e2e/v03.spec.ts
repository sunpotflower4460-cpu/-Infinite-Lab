import { expect, test, type Page } from '@playwright/test'

async function ready(page: Page, text = '3.14159') {
  await expect(page.getByTestId('digit-stream')).toContainText(text)
}

/** Number of clearly lit pixels in the canvas screenshot (WebGL buffers can't be read back directly). */
async function litPixels(page: Page): Promise<number> {
  const png = (await page.getByTestId('lab-canvas').screenshot()).toString('base64')
  return page.evaluate(async (src) => {
    const img = new Image()
    img.src = 'data:image/png;base64,' + src
    await img.decode()
    const c = document.createElement('canvas')
    c.width = img.width
    c.height = img.height
    const g = c.getContext('2d')!
    g.drawImage(img, 0, 0)
    const d = g.getImageData(0, 0, c.width, c.height).data
    let n = 0
    for (let i = 0; i < d.length; i += 4) if (d[i]! + d[i + 1]! + d[i + 2]! > 150) n++
    return n
  }, png)
}

test('both geometry layers draw the same structure', async ({ page }) => {
  await page.goto('/')
  await ready(page)
  await page.getByLabel('Go to step').fill('1000')
  await page.getByLabel('Go to step').press('Enter')
  await expect(page.getByTestId('current-step')).toHaveText('1,000')
  await page.getByText('Scientific Mode').first().click()
  await page.getByText('Scientific Mode').first().click() // hide the overlay again for the pixel count
  await page.waitForTimeout(300)
  const instanced = await litPixels(page)
  await page.getByText('Scientific Mode').first().click()
  await page.getByLabel('Geometry layer').selectOption('graphics')
  await page.getByText('Scientific Mode').first().click()
  await page.waitForTimeout(500)
  const graphics = await litPixels(page)
  expect(instanced).toBeGreaterThan(5000)
  expect(graphics).toBeGreaterThan(5000)
  expect(Math.abs(instanced - graphics) / graphics).toBeLessThan(0.5) // same shapes, different anti-aliasing
})

test('Infinite Mode keeps computing digits and the result stays reproducible', async ({ page }) => {
  test.setTimeout(120_000)
  await page.goto('/')
  await ready(page)
  await page.getByTestId('precision').selectOption('100')
  await expect(page.getByTestId('status')).toContainText('100 digits')
  await page.getByRole('button', { name: '∞ Infinite' }).click()
  await page.getByRole('radio', { name: 'MAX' }).click()
  await page.getByRole('button', { name: 'Play' }).click()
  // 101 steps from 100 digits, then continues on 10,000 → 20,000 digits…
  await expect
    .poll(async () => Number((await page.getByTestId('current-step').textContent())!.replace(/,/g, '')), {
      timeout: 60_000,
    })
    .toBeGreaterThan(12_000)
  await page.getByRole('button', { name: 'Pause' }).click()
  await expect(page.getByRole('button', { name: 'Play' })).toBeVisible()
  await expect(page.getByTestId('status')).not.toContainText(/Precision\s*100 digits/)
  await expect(page.getByTestId('precision')).toContainText('(extended)')

  // Export, then re-import: recomputing with the extended precision in one go must give the same SHA-256.
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Export JSON' }).click(),
  ])
  const { readFileSync } = await import('node:fs')
  const file = JSON.parse(readFileSync(await download.path(), 'utf8'))
  expect(file.config.precision).toBeGreaterThanOrEqual(20_000)
  await page.getByRole('button', { name: '∞ Infinite' }).click() // off
  await page.getByTestId('import-file').setInputFiles({
    name: 'x.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(file)),
  })
  await expect(page.getByTestId('verify')).toContainText('reproduced', { timeout: 60_000 })
})

test('Compare Mode runs π and e in lockstep under identical conditions', async ({ page }) => {
  await page.goto('/')
  await ready(page)
  await page.getByLabel('Experiment').selectOption('circle-chain')
  await page.getByRole('button', { name: 'Compare' }).click()
  await expect(page.getByTestId('lane-1')).toBeVisible()
  await expect(page.getByLabel('Compare constant')).toHaveValue('e')
  await expect(page.getByTestId('lane-readout-0')).toContainText('π')

  await page.getByRole('radio', { name: '100x' }).click()
  await page.getByRole('button', { name: 'Play' }).click()
  await expect
    .poll(async () => Number((await page.getByTestId('current-step').textContent())!.replace(/,/g, '')))
    .toBeGreaterThan(100)
  await page.getByRole('button', { name: 'Pause' }).click()
  await expect(page.getByRole('button', { name: 'Play' })).toBeVisible()

  // both lanes stopped at exactly the same step
  const stepOf = async (lane: number) =>
    (await page.getByTestId(`lane-readout-${lane}`).locator('.lane-head .mono').textContent())!
  await expect.poll(async () => (await stepOf(0)) === (await stepOf(1))).toBe(true)

  // same step, different digit: π's 2nd digit is 1, e's is 7
  await page.getByLabel('Go to step').fill('2')
  await page.getByLabel('Go to step').press('Enter')
  await expect(page.getByTestId('lane-readout-0')).toContainText('STEP 2 · DIGIT 1')
  await expect(page.getByTestId('lane-readout-1')).toContainText('STEP 2 · DIGIT 7')

  // the second lane follows parameter changes
  await page.getByLabel('Compare constant').selectOption('phi')
  await expect(page.getByTestId('lane-readout-1')).toContainText('step 0')
  await page.getByRole('button', { name: 'Step' }).click()
  await expect(page.getByTestId('lane-readout-1')).toContainText('STEP 1 · DIGIT 1') // φ = 1.618…
  await expect(page.getByTestId('lane-readout-1')).toContainText('radius = 1 × 2')

  await page.getByRole('button', { name: 'Compare' }).click()
  await expect(page.getByTestId('lane-1')).toHaveCount(0)
})
