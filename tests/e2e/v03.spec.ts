import { expect, test, type Page } from '@playwright/test'

// On failure, print what the app itself reported (the CI log is often all there is).
test.afterEach(async ({ page }, info) => {
  if (info.status === info.expectedStatus) return
  const text = async (sel: string) =>
    (
      await page
        .locator(sel)
        .allTextContents()
        .catch(() => [])
    ).join(' | ') || '—'
  console.log(
    `[diagnostics] ${info.title}\n  error: ${await text('.error')}\n  status: ${await text('[data-testid="status"]')}` +
      `\n  timeline: ${await text('[data-testid="timeline"]')}\n  verify: ${await text('[data-testid="verify"]')}`,
  )
})

async function ready(page: Page, text = '3.14159') {
  await expect(page.getByTestId('digit-stream')).toContainText(text)
}

/** Lit-pixel mask (1 = clearly lit) of the canvas screenshot. WebGL buffers can't be read back directly. */
async function litMask(page: Page): Promise<{ w: number; h: number; mask: number[] }> {
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
    const mask: number[] = []
    for (let i = 0; i < d.length; i += 4) mask.push(d[i]! + d[i + 1]! + d[i + 2]! > 150 ? 1 : 0)
    return { w: c.width, h: c.height, mask }
  }, png)
}

/** Fraction of lit pixels of `a` that have a lit pixel of `b` within `r` pixels. */
function coverage(
  a: { w: number; mask: number[] },
  b: { w: number; h: number; mask: number[] },
  r = 2,
): number {
  let lit = 0
  let hit = 0
  for (let i = 0; i < a.mask.length; i++) {
    if (!a.mask[i]) continue
    lit++
    const x = i % a.w
    const y = (i - x) / a.w
    search: for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const xx = x + dx
        const yy = y + dy
        if (xx >= 0 && yy >= 0 && xx < b.w && yy < b.h && b.mask[yy * b.w + xx]) {
          hit++
          break search
        }
      }
    }
  }
  return lit ? hit / lit : 0
}

test('both geometry layers draw the same structure', async ({ page }) => {
  await page.goto('/')
  await ready(page)
  await page.getByLabel('Go to step').fill('1000')
  await page.getByLabel('Go to step').press('Enter')
  await expect(page.getByTestId('current-step')).toHaveText('1,000')
  const scientific = page.getByText('Scientific Mode').first()
  await scientific.click()
  const backend = await page.locator('.sci-row', { hasText: 'Renderer backend' }).locator('dd').textContent()
  if (backend !== 'webgl') {
    // Without WebGL the app must fall back to the Graphics layer (and still draw).
    await expect(page.getByLabel('Geometry layer')).toHaveValue('graphics')
    await scientific.click()
    await page.waitForTimeout(300)
    const g = await litMask(page)
    expect(g.mask.reduce((a, v) => a + v, 0)).toBeGreaterThan(3000)
    return
  }
  await scientific.click() // hide the overlay for the screenshots
  await page.waitForTimeout(300)
  const instanced = await litMask(page)
  await scientific.click()
  await page.getByLabel('Geometry layer').selectOption('graphics')
  await scientific.click()
  await page.waitForTimeout(500)
  const graphics = await litMask(page)
  expect(instanced.mask.reduce((a, v) => a + v, 0)).toBeGreaterThan(3000)
  expect(graphics.mask.reduce((a, v) => a + v, 0)).toBeGreaterThan(3000)
  // same shapes in the same places (anti-aliasing differs between the two layers and engines)
  expect(coverage(instanced, graphics)).toBeGreaterThan(0.85)
  expect(coverage(graphics, instanced)).toBeGreaterThan(0.85)
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

/** Values grow while playing; the layout must not move the transport buttons under the pointer. */
async function transportStaysPut(page: Page) {
  await page.goto('/')
  await ready(page)
  await page.getByRole('radio', { name: '10x' }).click()
  const box = async () => (await page.getByRole('button', { name: /^(Play|Pause)$/ }).boundingBox())!
  const start = await box()
  await page.getByRole('button', { name: 'Play' }).click()
  let drift = 0
  for (let i = 0; i < 12; i++) {
    const b = await box()
    drift = Math.max(drift, Math.abs(b.x - start.x), Math.abs(b.y - start.y))
    await page.waitForTimeout(150)
  }
  await page.getByRole('button', { name: 'Pause' }).click()
  // a wrapped formula line moves the buttons by a whole line (~18 px); allow sub-pixel rounding
  expect(drift).toBeLessThan(1)
}

test('the transport buttons stay in place while values grow during playback', async ({ page }) => {
  await transportStaysPut(page)
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

test('PNG / SVG / CSV export the visible geometry', async ({ page }) => {
  const { readFileSync } = await import('node:fs')
  await page.goto('/')
  await ready(page)
  await page.getByLabel('Go to step').fill('200')
  await page.getByLabel('Go to step').press('Enter')
  await expect(page.getByTestId('current-step')).toHaveText('200')
  await page.getByLabel('Go to step').fill('50') // Timeline: only steps 1–50 are visible / exported
  await page.getByLabel('Go to step').press('Enter')
  await expect(page.getByTestId('timeline')).toContainText('viewing')

  const get = async (name: string) => {
    const [d] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name, exact: true }).click(),
    ])
    return { name: d.suggestedFilename(), data: readFileSync(await d.path()) }
  }
  const csv = await get('CSV')
  expect(csv.name).toBe('pi-infinite-lab_digit-circle-walk_pi_50.csv')
  const rows = csv.data.toString('utf8').trim().split('\n')
  expect(rows[0]).toBe('step,kind,x,y,radius,x2,y2,start_angle,sweep')
  expect(rows).toHaveLength(1 + 100) // 50 steps × (line + circle)
  // digit 3: angle 0.6π, distance 10 — computed with the same deterministic cos/sin the app uses
  const { detCos, detSin } = await import('../../src/math/detmath')
  const angle = (3 / 10) * (2 * Math.PI)
  expect(rows[1]).toBe(`1,line,0,0,,${0 + detCos(angle) * 10},${0 + detSin(angle) * 10},,`)
  expect(rows[100]!.startsWith('50,circle,')).toBe(true)

  const svg = await get('SVG')
  const text = svg.data.toString('utf8')
  expect(text.match(/data-step=/g)).toHaveLength(100)
  expect(text).toContain('angle = digit / 10 × 2π')

  const png = await get('PNG')
  expect(png.data.subarray(1, 4).toString('latin1')).toBe('PNG')
  expect(png.data.length).toBeGreaterThan(2000)
})

test.describe('mobile layout (spec §30)', () => {
  test.skip(({ browserName }) => browserName === 'firefox', 'Playwright cannot emulate mobile in Firefox')
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })

  test('the transport buttons stay in place while values grow', async ({ page }) => {
    await transportStaysPut(page)
  })

  test('canvas first, Setup and Inspector as bottom sheets', async ({ page }) => {
    await page.goto('/')
    await ready(page)
    const canvas = page.getByTestId('lab-canvas')
    const box = (await canvas.boundingBox())!
    expect(box.width).toBeGreaterThan(350)
    expect(box.height).toBeGreaterThan(300)
    await expect(page.getByRole('complementary', { name: 'Setup' })).not.toBeInViewport()

    await page.getByRole('button', { name: '⚙ Setup' }).click()
    await expect(page.getByRole('complementary', { name: 'Setup' })).toBeInViewport()
    await page.getByLabel('Experiment').selectOption('circle-chain')
    await page.getByRole('button', { name: 'Close Setup' }).click()
    await expect(page.getByRole('complementary', { name: 'Setup' })).not.toBeInViewport()
    await page.screenshot({ path: 'test-results/mobile-canvas.png' })

    // tapping the geometry opens the Inspector sheet on that step
    await page.getByRole('button', { name: 'Step' }).click()
    await expect(page.getByTestId('current-step')).toHaveText('1')
    const b = (await canvas.boundingBox())!
    await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2) // circle 1 is centred by Fit All
    await expect(page.getByRole('complementary', { name: 'Inspector' })).toBeInViewport()
    await expect(page.getByTestId('inspector')).toContainText('pinned')
    await page.screenshot({ path: 'test-results/mobile-inspector.png' })
  })
})
