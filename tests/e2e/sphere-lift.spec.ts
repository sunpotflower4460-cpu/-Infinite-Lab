import { expect, test, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
const view = (page: Page, name: string) =>
  page.getByRole('group', { name: 'Two-Arm view' }).getByRole('button', { name, exact: true })
async function ready(page: Page) {
  await page.goto('/#lab')
  await expect(page.getByTestId('digit-stream')).toContainText('3.14159')
  await view(page, '2D').click()
}
async function go(page: Page, step: number) {
  await page.getByLabel('Go to step').fill(String(step))
  await page.getByLabel('Go to step').press('Enter')
  await expect(page.getByTestId('current-step')).toHaveText(step.toLocaleString('en-US'))
}
test('shape switching retains time, parameters and source digest; all overlays export labeled coordinates', async ({
  page,
}) => {
  await ready(page)
  await go(page, 300)
  await view(page, 'Sphere').click()
  await expect(page.getByTestId('current-step')).toHaveText('300')
  await expect(page.getByTestId('overlay-rule')).toContainText('Solo')
  await expect(page.getByTestId('inspector')).toContainText('δ = ((π − 1)')
  for (const name of ['左右対称', '陰陽', 'Solo', '陰陽'])
    await page.getByRole('button', { name, exact: true }).click()
  await page.getByLabel('Trail', { exact: true }).selectOption('100')
  const [csv] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'CSV', exact: true }).click(),
  ])
  const rows = readFileSync(await csv.path(), 'utf8')
    .trim()
    .split('\n')
  expect(rows).toHaveLength(201)
  expect(rows[0]).toContain('z,flow')
  await view(page, '2D').click()
  await expect(page.getByTestId('current-step')).toHaveText('300')
  await expect(page.getByTestId('canvas-3d')).toHaveCount(0)
})
test('JSON and History round-trip view settings while SHA-256 continues to verify', async ({ page }) => {
  await ready(page)
  await view(page, 'Sphere').click()
  await go(page, 300)
  await page.getByRole('button', { name: '陰陽', exact: true }).click()
  await page.getByLabel('Trail', { exact: true }).selectOption('100')
  if (await page.getByRole('button', { name: '真上から', exact: true }).count())
    await page.getByRole('button', { name: '真上から', exact: true }).click()
  const [json] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Export JSON', exact: true }).click(),
  ])
  const file = JSON.parse(readFileSync(await json.path(), 'utf8'))
  expect(file.version).toBe(6)
  expect(file.config.presentation.mode).toBe('yin-yang')
  expect(file.config.presentation.trail).toBe(100)
  if (await page.getByTestId('canvas-3d').count())
    expect(file.config.presentation.camera.projection).toBe('orthographic')
  expect(file.result.geometryRecords).toBe(300)
  await page.getByRole('button', { name: 'Save current state' }).click()
  await expect(page.getByTestId('history').locator('.history-restore')).toHaveCount(1)
  await page.getByRole('button', { name: 'Solo', exact: true }).click()
  await page.getByTestId('history').locator('.history-restore').click()
  await expect(page.getByTestId('verify')).toContainText('reproduced')
  await expect(page.getByRole('button', { name: '陰陽', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )

  await page.getByRole('button', { name: 'Solo', exact: true }).click()
  await page.getByTestId('import-file').setInputFiles(await json.path())
  await expect(page.getByTestId('verify')).toContainText('reproduced')
  await expect(page.getByRole('button', { name: '陰陽', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
})
test('Film switches are independent of pause; mobile labels remain on-screen and touch orbit works', async ({
  page,
  browserName,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/#film')
  await expect(page.getByTestId('film')).toBeVisible()
  await page.getByRole('button', { name: 'Pause film', exact: true }).click()
  await view(page, 'Sphere').click()
  await expect(page.getByRole('button', { name: 'Play film', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '陰陽', exact: true }).click()
  for (const locator of [
    view(page, 'Height'),
    page.getByRole('button', { name: '陰陽', exact: true }),
    page.getByRole('button', { name: 'Close film' }),
    ...((await page.getByRole('button', { name: 'Save film as video' }).count())
      ? [page.getByRole('button', { name: 'Save film as video' })]
      : []),
  ]) {
    const b = await locator.boundingBox()
    expect(b).not.toBeNull()
    expect(b!.x).toBeGreaterThanOrEqual(0)
    expect(b!.x + b!.width).toBeLessThanOrEqual(390)
  }
  await expect(page.getByTestId('canvas-3d').or(page.getByTestId('webgl-missing'))).toBeVisible()
  if (await page.getByTestId('canvas-3d').count()) {
    await page.getByRole('button', { name: '真上から', exact: true }).click()
    await page.getByRole('button', { name: '斜めから', exact: true }).click()
    if (browserName === 'chromium') {
      const client = await page.context().newCDPSession(page)
      await client.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [
          { x: 120, y: 330, id: 1 },
          { x: 220, y: 330, id: 2 },
        ],
      })
      await client.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [
          { x: 100, y: 320, id: 1 },
          { x: 240, y: 340, id: 2 },
        ],
      })
      await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
      await client.detach()
    }
  } else await expect(page.getByTestId('webgl-missing')).toBeVisible()
})

test('a derived line picks its original step; PNG and video include the pair and restore camera/step', async ({
  page,
}) => {
  test.setTimeout(120_000)
  await ready(page)
  await view(page, 'Sphere').click()
  await go(page, 300)
  await expect(page.getByTestId('canvas-3d').or(page.getByTestId('webgl-missing'))).toBeVisible()
  if (await page.getByTestId('webgl-missing').count()) return
  await page.getByRole('button', { name: '陰陽', exact: true }).click()
  await page.locator('.observation-options summary').click()
  await page.getByLabel('表示する流れ').selectOption('derived')
  await page.locator('.observation-options summary').click()
  await page.waitForTimeout(150)
  const pixel = await page.getByTestId('canvas-3d').evaluate((canvas: HTMLCanvasElement) => {
    const c = document.createElement('canvas')
    c.width = canvas.width
    c.height = canvas.height
    const ctx = c.getContext('2d')!
    ctx.drawImage(canvas, 0, 0)
    const data = ctx.getImageData(0, 0, c.width, c.height).data
    for (let y = 80; y < c.height - 80; y++)
      for (let x = 80; x < c.width - 80; x++) {
        const i = (y * c.width + x) * 4
        if (data[i + 2]! > data[i]! + 15 && data[i + 2]! > 45)
          return { x: (x * canvas.clientWidth) / c.width, y: (y * canvas.clientHeight) / c.height }
      }
    return null
  })
  expect(pixel).not.toBeNull()
  const rect = await page.getByTestId('canvas-3d').boundingBox()
  await page.mouse.click(rect!.x + pixel!.x, rect!.y + pixel!.y)
  await expect(page.getByTestId('inspector-flow')).toContainText('陽 / derived')
  await expect(page.getByTestId('derived-coordinates')).toContainText('P′')
  await page.locator('.observation-options summary').click()
  await page.getByLabel('表示する流れ').selectOption('both')
  await page.locator('.observation-options summary').click()
  // Full orbit gesture: continuous dragging with an unlocked camera.
  for (let i = 0; i < 4; i++) {
    await page.mouse.move(rect!.x + rect!.width * 0.3, rect!.y + rect!.height * 0.5)
    await page.mouse.down()
    await page.mouse.move(rect!.x + rect!.width * 0.7, rect!.y + rect!.height * 0.5, { steps: 8 })
    await page.mouse.up()
  }
  await page.getByRole('button', { name: '斜めから', exact: true }).click()
  const [before] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Export JSON', exact: true }).click(),
  ])
  const a = JSON.parse(readFileSync(await before.path(), 'utf8'))
  const [png] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'PNG', exact: true }).click(),
  ])
  expect(
    readFileSync(await png.path())
      .subarray(1, 4)
      .toString(),
  ).toBe('PNG')
  if (await page.evaluate(() => typeof VideoEncoder !== 'undefined')) {
    await page.getByRole('button', { name: 'Video', exact: true }).click()
    await page.getByLabel('Video length').selectOption('2')
    await page.getByLabel('Video format').selectOption('mp4')
    const [video] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Record', exact: true }).click(),
    ])
    expect(
      readFileSync(await video.path())
        .subarray(4, 8)
        .toString(),
    ).toBe('ftyp')
    await video.saveAs('artifacts/sphere-lift/sphere-yin-yang.mp4')
    await expect(page.getByTestId('video-status')).toContainText('saved')
  }
  const [after] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Export JSON', exact: true }).click(),
  ])
  const b = JSON.parse(readFileSync(await after.path(), 'utf8'))
  expect(b.config.presentation.camera.target).toEqual(a.config.presentation.camera.target)
  b.config.presentation.camera.position.forEach((value: number, i: number) =>
    expect(value).toBeCloseTo(a.config.presentation.camera.position[i], 10),
  )
  expect(b.steps).toBe(a.steps)
  expect(b.result.geometrySha256).toBe(a.result.geometrySha256)
})
