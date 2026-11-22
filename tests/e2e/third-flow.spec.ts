import { expect, test, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { PerspectiveCamera, Vector3 } from 'three'

const view = (page: Page, name: string) =>
  page.getByRole('group', { name: 'Two-Arm view' }).getByRole('button', { name, exact: true })
async function ready(page: Page) {
  await page.goto('/#lab')
  await expect(page.getByTestId('digit-stream')).toContainText('3.14159')
  await view(page, 'Torus').click()
  await page.getByLabel('Go to step').fill('300')
  await page.getByLabel('Go to step').press('Enter')
  await expect(page.getByTestId('current-step')).toHaveText('300')
}
async function download(page: Page, name: string) {
  const [file] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name, exact: true }).click(),
  ])
  return { file, text: readFileSync(await file.path(), 'utf8') }
}
async function options(page: Page, action: () => Promise<unknown>) {
  await page.locator('.observation-options summary').click()
  await action()
  await page.locator('.observation-options summary').click()
}

test('actual third circle preserves P/-P and exports the additional circular motion, with JSON and History', async ({
  page,
}) => {
  await ready(page)
  const before = JSON.parse((await download(page, 'Export JSON')).text)
  await page.getByRole('button', { name: '陰陽', exact: true }).click()
  await page.getByLabel('第3の円を追加', { exact: true }).check()
  await expect(page.getByRole('button', { name: '陰陽', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect(page.getByTestId('third-rule')).toContainText('1:π:π²')
  await page.getByLabel('Trail', { exact: true }).selectOption('100')
  const rows = (await download(page, 'CSV')).text
    .trim()
    .split('\n')
    .map((row) => row.split(','))
  expect(rows).toHaveLength(301)
  let inside = 0,
    outside = 0
  for (let i = 1; i <= 100; i++) {
    const a = rows[i]!,
      b = rows[i + 100]!,
      q = rows[i + 200]!
    expect([a[10], b[10], q[10]]).toEqual(['original', 'derived', 'third'])
    expect(a[0]).toBe(q[0])
    for (const j of [2, 3, 9]) expect(Number(a[j]) + Number(b[j])).toBe(0)
    const n = Number(a[0]),
      u = n * 0.05,
      w = Math.PI * Math.PI * u
    const delta = [Number(q[2]) - Number(a[2]), Number(q[3]) - Number(a[3]), Number(q[9]) - Number(a[9])]
    const expected = [-100 * Math.cos(w) * Math.sin(u), 100 * Math.cos(w) * Math.cos(u), 100 * Math.sin(w)]
    delta.forEach((value, j) => expect(Math.abs(value - expected[j]!) / 100).toBeLessThan(4e-13))
    expect(Math.hypot(...delta)).toBeCloseTo(100, 10)
    const distance = Math.hypot(Math.hypot(Number(q[2]), Number(q[3])) - 130, Number(q[9]))
    if (distance < 99) inside++
    if (distance > 101) outside++
  }
  expect(inside).toBeGreaterThan(0)
  expect(outside).toBeGreaterThan(0)
  const canonical = JSON.parse((await download(page, 'Export JSON')).text)
  expect(canonical.result.thirdCircle.geometrySha256).toBe(
    '98256d86efddb394a336931ccdcc4b9c723df9373f0597299ab53aebc17b58a3',
  )
  await options(page, async () => {
    await page.getByLabel('第3の半径 / 管半径').fill('0.75')
    await page.getByLabel('第3の濃さ').press('Home')
    for (let i = 0; i < 18; i++) await page.getByLabel('第3の濃さ').press('ArrowRight')
    await page.getByLabel('3つの作図円', { exact: true }).uncheck()
    await page.getByLabel('トーラス面の補助表示').check()
    await page.getByLabel('表示する流れ').selectOption('third')
    await page.getByLabel('第3の先端の軌跡', { exact: true }).check()
  })
  const only = (await download(page, 'CSV')).text
    .trim()
    .split('\n')
    .map((row) => row.split(','))
  expect(only).toHaveLength(101)
  for (let i = 1; i <= 100; i++)
    expect(
      Math.hypot(
        Number(only[i]![2]) - Number(rows[i]![2]),
        Number(only[i]![3]) - Number(rows[i]![3]),
        Number(only[i]![9]) - Number(rows[i]![9]),
      ),
    ).toBeCloseTo(75, 10)
  const svg = (await download(page, 'SVG')).text
  expect(svg).toContain('data-flow="third"')
  expect(svg).not.toContain('data-flow="derived"')
  expect(svg).toContain('stroke-opacity="0.18"')
  const saved = await download(page, 'Export JSON'),
    file = JSON.parse(saved.text)
  expect(file.version).toBe(6)
  expect(file.result.geometrySha256).toBe(before.result.geometrySha256)
  expect(file.result.geometryRecords).toBe(300)
  expect(file.result.thirdCircle.geometryRecords).toBe(300)
  expect(file.result.thirdCircle.geometrySha256).toMatch(/^[0-9a-f]{64}$/)
  expect(file.config.presentation).toMatchObject({
    thirdFlow: true,
    thirdModel: 'circle',
    thirdRadius: 0.75,
    thirdOpacity: 0.18,
    thirdGuides: false,
    flow: 'third',
  })
  await page.getByRole('button', { name: 'Save current state' }).click()
  await page.getByLabel('第3の円を追加', { exact: true }).uncheck()
  await page.getByTestId('history').locator('.history-restore').click()
  await expect(page.getByTestId('verify')).toContainText('reproduced')
  await expect(page.getByLabel('第3の円を追加', { exact: true })).toBeChecked()
  expect(JSON.parse((await download(page, 'Export JSON')).text).result.thirdCircle.geometrySha256).toBe(
    file.result.thirdCircle.geometrySha256,
  )
  await page.getByLabel('第3の円を追加', { exact: true }).uncheck()
  await page.getByTestId('import-file').setInputFiles(await saved.file.path())
  await expect(page.getByTestId('verify')).toContainText('reproduced')
  await expect(page.getByTestId('verify')).toHaveAttribute('title', /両方/)
  await view(page, 'Sphere').click()
  await expect(page.getByTestId('third-rule')).toHaveCount(0)
  expect((await download(page, 'CSV')).text.trim().split('\n')).toHaveLength(201)
  await view(page, 'Torus').click()
  await expect(page.getByLabel('第3の円を追加', { exact: true })).toBeChecked()
  await page.getByRole('button', { name: 'Solo', exact: true }).click()
  await expect(page.getByLabel('第3の円を追加', { exact: true })).toBeChecked()
  await page.getByLabel('第3の円を追加', { exact: true }).uncheck()
  expect(JSON.parse((await download(page, 'Export JSON')).text).result.geometrySha256).toBe(
    before.result.geometrySha256,
  )
})

test('translucent third flow picks the source step, becomes invisible at zero, and survives PNG/video export', async ({
  page,
}) => {
  test.setTimeout(120_000)
  await ready(page)
  await page.getByLabel('第3の円を追加', { exact: true }).check()
  await options(page, async () => {
    await page.getByLabel('表示する流れ').selectOption('third')
    await page.getByLabel('第3の先端の軌跡', { exact: true }).check()
    await page.getByLabel('第3の濃さ').press('End')
    await page.getByLabel('線幅').press('End')
    await page.getByLabel('3つの作図円', { exact: true }).uncheck()
  })
  await expect(page.getByTestId('canvas-3d').or(page.getByTestId('webgl-missing'))).toBeVisible()
  const canvas = (await page.getByTestId('canvas-3d').count())
    ? page.getByTestId('canvas-3d')
    : page.getByTestId('lab-canvas')
  // Read the real raster, so this exercises both native/wide Three paths and the fallback renderer.
  const coloredPixel = () =>
    canvas.evaluate((el: HTMLCanvasElement) => {
      const c = document.createElement('canvas')
      c.width = el.width
      c.height = el.height
      const ctx = c.getContext('2d')!
      ctx.drawImage(el, 0, 0)
      const d = ctx.getImageData(0, 0, c.width, c.height).data
      for (let y = 70; y < c.height - 70; y++)
        for (let x = 70; x < c.width - 70; x++) {
          const i = (y * c.width + x) * 4
          if (d[i + 2]! > d[i]! + 6 && d[i]! > d[i + 1]! + 6 && d[i + 2]! > 30)
            return { x: (x * el.clientWidth) / c.width, y: (y * el.clientHeight) / c.height }
        }
      return null
    })
  await expect.poll(coloredPixel).not.toBeNull()
  if (await page.getByTestId('canvas-3d').count()) {
    // Opaque wide stroke cores must retain the chosen sRGB palette color. Without
    // output encoding the same #cbb0ed tint becomes the much darker #986fd8.
    const dominant = await canvas.evaluate((el: HTMLCanvasElement) => {
      const c = document.createElement('canvas')
      c.width = el.width
      c.height = el.height
      const ctx = c.getContext('2d')!
      ctx.drawImage(el, 0, 0)
      const pixels = ctx.getImageData(0, 0, c.width, c.height).data
      const counts = new Map<string, number>()
      for (let i = 0; i < pixels.length; i += 4) {
        const [r, g, b] = [pixels[i]!, pixels[i + 1]!, pixels[i + 2]!]
        if (b > r + 6 && r > g + 6 && b > 80) {
          const key = [r, g, b].join(',')
          counts.set(key, (counts.get(key) ?? 0) + 1)
        }
      }
      return [...counts]
        .sort((a, b) => b[1] - a[1])[0]?.[0]
        .split(',')
        .map(Number)
    })
    expect(dominant).toHaveLength(3)
    dominant!.forEach((value, i) => expect(Math.abs(value - [203, 176, 237][i]!)).toBeLessThanOrEqual(1))
  }
  const pixel = await coloredPixel()
  const rect = await canvas.boundingBox()
  await page.mouse.click(rect!.x + pixel!.x, rect!.y + pixel!.y)
  await expect(page.getByTestId('inspector-flow')).toContainText('第3円の先端 Q / third')
  await expect(page.getByTestId('inspector').locator('.badge')).toContainText('pinned')
  const n = Number((await page.getByTestId('inspector-step').textContent())!.replaceAll(',', ''))
  const q = (await download(page, 'CSV')).text.trim().split('\n')[n]!.split(',')
  const text = await page.getByTestId('derived-coordinates').textContent()
  const xyz = text!
    .match(/Q = \(([^)]+)\)/)![1]!
    .split(',')
    .map(Number)
  expect(xyz).toEqual([Number(q[2]), Number(q[3]), Number(q[9])])
  await options(page, () => page.getByLabel('第3の濃さ').press('Home'))
  await expect.poll(coloredPixel).toBeNull()
  await options(page, async () => {
    await page.getByLabel('第3の濃さ').press('End')
    await page.getByLabel('表示する流れ').selectOption('both')
    await page.getByLabel('トーラス面の補助表示').check()
  })
  const before = JSON.parse((await download(page, 'Export JSON')).text)
  const png = await download(page, 'PNG')
  expect(
    readFileSync(await png.file.path())
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
    await expect(page.getByTestId('video-status')).toContainText('saved')
  }
  const after = JSON.parse((await download(page, 'Export JSON')).text)
  expect(after.result.geometrySha256).toBe(before.result.geometrySha256)
  expect(after.steps).toBe(before.steps)
  const { camera: a, ...beforeStyle } = before.config.presentation
  const { camera: b, ...afterStyle } = after.config.presentation
  expect(afterStyle).toEqual(beforeStyle)
  expect(b?.target).toEqual(a?.target)
  if (a) b.position.forEach((v: number, i: number) => expect(v).toBeCloseTo(a.position[i], 10))
})

test('390×844 Film keeps third-flow controls, camera and scrollable adjustments usable', async ({
  page,
  browserName,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/#film')
  await page.getByRole('button', { name: 'Pause film', exact: true }).click()
  const time = await page.getByTestId('film-time').textContent()
  await view(page, 'Torus').click()
  await page.getByLabel('第3の円を追加', { exact: true }).check()
  await expect(page.getByTestId('film-time')).toHaveText(time!)
  const info = await page.getByTestId('observation-controls').boundingBox()
  const third = await page.getByLabel('第3の円を追加', { exact: true }).boundingBox()
  expect(third!.y + third!.height).toBeLessThan(info!.y + info!.height)
  if (await page.getByTestId('canvas-3d').count()) {
    const rotate = await page.getByRole('button', { name: '⟳ Rotate', exact: true }).boundingBox()
    expect(rotate!.y).toBeGreaterThanOrEqual(info!.y + info!.height)
    await page.getByRole('button', { name: '真上から', exact: true }).click()
    await page.getByRole('button', { name: '斜めから', exact: true }).click()
    if (browserName === 'chromium') {
      const box = await page.getByTestId('canvas-3d').boundingBox()
      const client = await page.context().newCDPSession(page)
      for (const [type, dx] of [
        ['touchStart', 0],
        ['touchMove', 16],
        ['touchEnd', 0],
      ] as const)
        await client.send('Input.dispatchTouchEvent', {
          type,
          touchPoints:
            type === 'touchEnd'
              ? []
              : [
                  { x: 100 - dx, y: box!.y + box!.height * 0.7, id: 1 },
                  { x: 220 + dx, y: box!.y + box!.height * 0.7, id: 2 },
                ],
        })
      await client.detach()
    }
  }
  await options(page, async () => {
    await page.getByLabel('第3の半径 / 管半径').fill('0.75')
    await page.getByLabel('トーラス面の補助表示').check()
    await page.getByLabel('発光量').scrollIntoViewIfNeeded()
    const b = await page.getByLabel('発光量').boundingBox()
    expect(b!.y + b!.height).toBeLessThanOrEqual(844)
  })
  await expect(page.getByTestId('third-rule')).toContainText('1:π:π²')
  for (const button of [
    page.getByRole('button', { name: 'Close film' }),
    page.getByRole('button', { name: 'Save film as video' }),
  ]) {
    if (!(await button.count())) continue
    const b = await button.boundingBox()
    expect(b!.x).toBeGreaterThanOrEqual(0)
    expect(b!.x + b!.width).toBeLessThanOrEqual(390)
  }
})

test('third-only changes keep Solo and original data; verifies Q hash and preserves legacy phase files', async ({
  page,
}) => {
  await ready(page)
  const before = JSON.parse((await download(page, 'Export JSON')).text)
  await page.getByLabel('第3の円を追加', { exact: true }).check()
  await expect(page.getByRole('button', { name: 'Solo', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  if (await page.getByTestId('canvas-3d').count()) {
    await page.getByLabel('Microscope from step').fill('170')
    await page.getByLabel('Microscope to step').fill('170')
    await page.getByRole('button', { name: 'Zoom', exact: true }).click()
    await expect(page.getByTestId('microscope-range')).toHaveText('170–170')
    await page.waitForTimeout(100)
    const snapshot = JSON.parse((await download(page, 'Export JSON')).text)
    const row = (await download(page, 'CSV')).text.trim().split('\n')[1]!.split(',')
    const center = new Vector3(Number(row[2]), Number(row[3]), Number(row[9]))
    const box = await page.getByTestId('canvas-3d').boundingBox(),
      pose = snapshot.config.presentation.camera
    const camera = new PerspectiveCamera(40, box!.width / box!.height, 0.01, 1e7)
    camera.up.set(0, 0, 1)
    camera.position.fromArray(pose.position)
    camera.lookAt(new Vector3(...pose.target))
    camera.updateMatrixWorld()
    const u = 170 * 0.05
    for (let i = 0; i < 64; i++) {
      const angle = (i * 2 * Math.PI) / 64
      const q = center
        .clone()
        .add(
          new Vector3(
            -100 * Math.cos(angle) * Math.sin(u),
            100 * Math.cos(angle) * Math.cos(u),
            100 * Math.sin(angle),
          ),
        )
        .project(camera)
      expect(Math.abs(q.x)).toBeLessThan(0.99)
      expect(Math.abs(q.y)).toBeLessThan(0.99)
    }
    await page.getByRole('button', { name: 'Exit microscope view', exact: true }).click()
  }
  await options(page, async () => {
    for (const radius of ['0.2', '2', '0.75']) await page.getByLabel('第3の半径 / 管半径').fill(radius)
  })
  const file = JSON.parse((await download(page, 'Export JSON')).text)
  expect(file.result.geometrySha256).toBe(before.result.geometrySha256)
  expect(file.config.presentation.thirdRadius).toBe(0.75)
  const bad = structuredClone(file)
  bad.result.thirdCircle.geometrySha256 = 'f'.repeat(64)
  await page.getByTestId('import-file').setInputFiles({
    name: 'bad-q.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(bad)),
  })
  await expect(page.getByTestId('verify')).toContainText('第3円Q')
  await expect(page.getByTestId('verify')).toContainText('differs')
  const legacy = structuredClone(before)
  legacy.version = 5
  legacy.config.presentation = {
    ...legacy.config.presentation,
    mode: 'yin-yang',
    thirdFlow: true,
    thirdOpacity: 0.23,
    thirdQuarter: -1,
  }
  for (const key of ['thirdModel', 'thirdRadius', 'thirdGuides', 'thirdTrace'])
    delete legacy.config.presentation[key]
  await page.getByTestId('import-file').setInputFiles({
    name: 'v5-phase.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(legacy)),
  })
  await expect(page.getByTestId('verify')).toContainText('reproduced')
  await expect(page.getByTestId('third-rule')).toContainText('旧位相モデル')
  const restored = JSON.parse((await download(page, 'Export JSON')).text)
  expect(restored.config.presentation.thirdModel).toBe('phase')
  expect(restored.result.geometrySha256).toBe(before.result.geometrySha256)
  await options(page, () => page.getByRole('button', { name: '第3の円に切替', exact: true }).click())
  await expect(page.getByTestId('third-rule')).toContainText('1:π:π²')
})
