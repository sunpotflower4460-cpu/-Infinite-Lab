import { expect, test, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'

const torus = (page: Page) =>
  page.getByRole('group', { name: 'Two-Arm view' }).getByRole('button', { name: 'Torus', exact: true })
async function exported(page: Page) {
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Export JSON', exact: true }).click(),
  ])
  return JSON.parse(readFileSync(await download.path(), 'utf8'))
}
async function go(page: Page, n: number) {
  await page.getByLabel('Go to step').fill(String(n))
  await page.getByLabel('Go to step').press('Enter')
  await expect(page.getByTestId('current-step')).toHaveText(n.toLocaleString('en-US'))
}

test('torus mirrors and antipodes remain on the surface and retain the original digest and step', async ({
  page,
}) => {
  await page.goto('/#lab')
  await expect(page.getByTestId('digit-stream')).toContainText('3.14159')
  await torus(page).click()
  await go(page, 300)
  await expect(page.getByTestId('torus-readout')).toContainText('リング（穴あり）')
  await expect(page.getByTestId('torus-readout')).toContainText('x・yは変換')
  const before = await exported(page)
  for (const mode of ['左右対称', '陰陽']) {
    await page.getByRole('button', { name: mode, exact: true }).click()
    const file = await exported(page)
    expect(file.result.geometrySha256).toBe(before.result.geometrySha256)
    expect(file.steps).toBe(300)
    expect(file.result.geometryRecords).toBe(300)
  }
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
  for (let i = 1; i <= 100; i++) {
    const a = rows[i]!.split(','),
      b = rows[i + 100]!.split(',')
    expect(a[0]).toBe(b[0])
    for (const j of [2, 3, 9]) expect(Number(a[j]) + Number(b[j])).toBe(0)
    const [x, y, z] = [Number(a[2]), Number(a[3]), Number(a[9])]
    expect(Math.abs((Math.hypot(x, y) - 130) ** 2 + z * z - 10000) / 52900).toBeLessThan(4e-15)
  }
  const [json] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Export JSON', exact: true }).click(),
  ])
  await page.getByRole('button', { name: 'Solo', exact: true }).click()
  await page.getByTestId('import-file').setInputFiles(await json.path())
  await expect(page.getByTestId('verify')).toContainText('reproduced')
  await expect(page.getByRole('button', { name: '陰陽', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect(page.getByTestId('current-step')).toHaveText('300')
})

test('390×844 Film explains torus radii and its executed formula, preserving time through explicit radii presets', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/#film')
  await expect(page.getByRole('button', { name: 'Pause film', exact: true })).toBeVisible()
  await expect(page.getByTestId('film-time')).not.toHaveText('T = 0.00')
  await page.getByRole('button', { name: 'Pause film', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Play film', exact: true })).toBeVisible()
  const time = await page.getByTestId('film-time').textContent()
  await torus(page).click()
  await expect(page.getByTestId('film-time')).toHaveText(time!)
  await expect(page.getByTestId('torus-readout')).toContainText('ホーン（穴が閉じる）')
  await page.locator('.observation-options summary').click()
  await page.getByRole('button', { name: '穴あり 腕1=1.3, 腕2=1', exact: true }).click()
  await expect(page.getByTestId('torus-readout')).toContainText('大半径 R=130 / 管半径 r=100')
  await expect(page.getByTestId('torus-readout')).toContainText('リング（穴あり）')
  await expect(page.getByTestId('film-time')).toHaveText(time!)
  await expect(page.getByRole('button', { name: 'Play film', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '穴なし 腕1=腕2=1', exact: true }).click()
  await expect(page.getByTestId('torus-readout')).toContainText('ホーン（穴が閉じる）')
  await expect(page.getByTestId('film-time')).toHaveText(time!)
  await page.locator('.observation-options summary').click()
  for (const locator of [
    torus(page),
    page.getByTestId('torus-readout'),
    page.getByRole('button', { name: 'Close film' }),
  ]) {
    const b = await locator.boundingBox()
    expect(b).not.toBeNull()
    expect(b!.x).toBeGreaterThanOrEqual(0)
    expect(b!.x + b!.width).toBeLessThanOrEqual(390)
  }
  await expect(page.getByTestId('canvas-3d').or(page.getByTestId('webgl-missing'))).toBeVisible()
  if (await page.getByTestId('canvas-3d').count()) {
    const info = await page.getByTestId('observation-controls').boundingBox()
    const rotate = await page.getByRole('button', { name: '⟳ Rotate', exact: true }).boundingBox()
    expect(info!.y + info!.height).toBeLessThanOrEqual(rotate!.y)
  }
  await page.getByRole('radio', { name: '専門', exact: true }).click()
  await expect(page.getByTestId('film-panel').getByTestId('formulas-current')).toContainText(
    'ρ = r1 + r2 × cos(θ₂)',
  )
  await expect(page.getByTestId('film-panel').getByTestId('formulas-current')).toContainText(
    'z[n] = scale × (r2 × sin(θ₂))',
  )
  await expect(page.getByTestId('film-flat-formula')).toHaveCount(0)
  await expect(page.getByTestId('film-convergents')).toContainText('q周（大円）・p周（管）')
})
