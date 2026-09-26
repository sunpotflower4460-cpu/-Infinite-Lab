import { readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'

async function ready(page: Page) {
  await expect(page.getByTestId('digit-stream')).toContainText('3.14159')
}

async function goTo(page: Page, step: number) {
  await page.getByLabel('Go to step').fill(String(step))
  await page.getByLabel('Go to step').press('Enter')
  await expect(page.getByTestId('current-step')).toHaveText(String(step))
}

test.describe('Formula Playground (spec §10)', () => {
  test('typed formulas are executed and shown as executed; invalid drafts do not run', async ({ page }) => {
    await page.goto('/#lab')
    await ready(page)
    await page.getByLabel('Experiment').selectOption('playground')
    const formulas = page.getByTestId('formulas-current')
    await expect(formulas).toContainText('angle = digit × π / 5')
    await expect(formulas).toContainText('radius = digit × 2')

    // edit → applied after a short pause, restarting from step 0
    await page.getByLabel('DISTANCE formula').fill('digit + 1')
    await expect(page.getByTestId('playground-state')).toContainText('Running these formulas')
    await expect(formulas).toContainText('distance = digit + 1')
    await goTo(page, 3) // digits 3, 1, 4 → the third step reads 4
    await expect(page.getByTestId('inspector')).toContainText('distance = digit + 1')
    await expect(page.getByTestId('inspector')).toContainText('= 4 + 1 = 5')

    // an invalid draft is marked where it breaks and does not replace the running formulas
    await page.getByLabel('ANGLE formula').fill('digit × foo')
    await expect(page.getByTestId('formula-error-angle')).toContainText('unknown name "foo"')
    await expect(page.getByTestId('formula-error-angle').locator('mark')).toHaveText('foo')
    await expect(page.getByTestId('playground-state')).toContainText('Not applied')
    await expect(formulas).toContainText('angle = digit × π / 5')
    await expect(page.getByTestId('current-step')).toHaveText('3')

    // C only exactly
    await page.getByLabel('ANGLE formula').fill('n × C')
    await expect(page.getByTestId('formula-error-angle')).toContainText('C can only be used exactly')
    await page.getByLabel('ANGLE formula').fill('(n × C) mod 2π')
    await page.getByLabel('ANGLE formula').press('Enter')
    await expect(formulas).toContainText('angle = (n × π) mod 2π')
  })

  test('formulas travel with the JSON export and reproduce on import', async ({ page }) => {
    await page.goto('/#lab')
    await ready(page)
    await page.getByTestId('preset').selectOption('playground-turning')
    await expect(page.getByTestId('status')).toContainText('10,000 digits')
    await expect(page.getByLabel('ANGLE formula')).toHaveValue('(angle_prev + digit × π / 5) mod 2π')
    await goTo(page, 500)
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Export JSON' }).click(),
    ])
    const file = JSON.parse(readFileSync(await download.path(), 'utf8'))
    expect(file.version).toBe(3)
    expect(file.config.formulas).toEqual({
      angle: '(angle_prev + digit × π / 5) mod 2π',
      radius: 'digit / 2',
      distance: '3',
    })
    expect(file.formulas).toContain('angle = (angle[n−1] + digit × π / 5) mod 2π')

    // back to the defaults, then import: the formulas come back and the geometry is identical
    await page.getByTestId('preset').selectOption('playground-spec')
    await expect(page.getByLabel('ANGLE formula')).toHaveValue('digit × π / 5')
    await page.getByTestId('import-file').setInputFiles({
      name: 'x.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(file)),
    })
    await expect(page.getByTestId('verify')).toContainText('reproduced', { timeout: 30_000 })
    await expect(page.getByLabel('ANGLE formula')).toHaveValue('(angle_prev + digit × π / 5) mod 2π')
  })

  test('a formula that produces an invalid value stops with the step and the reason', async ({ page }) => {
    await page.goto('/#lab')
    await ready(page)
    await page.getByLabel('Experiment').selectOption('playground')
    await page.getByLabel('RADIUS formula').fill('digit − 3')
    await page.getByLabel('RADIUS formula').press('Enter')
    await expect(page.getByTestId('formulas-current')).toContainText('radius = digit − 3')
    await page.getByRole('button', { name: 'Step' }).click() // 3 − 3 = 0: fine
    await page.getByRole('button', { name: 'Step' }).click() // 1 − 3 = −2
    await expect(page.locator('.error')).toContainText('step 2: radius = -2 (must be ≥ 0)')
    await expect(page.getByRole('button', { name: 'Play' })).toBeDisabled()

    // correcting the formula starts a fresh run
    await page.getByLabel('RADIUS formula').fill('digit')
    await page.getByLabel('RADIUS formula').press('Enter')
    await expect(page.locator('.error')).toHaveCount(0)
    await page.getByRole('button', { name: 'Step' }).click()
    await page.getByRole('button', { name: 'Step' }).click()
    await expect(page.getByTestId('current-step')).toHaveText('2')
  })
})

test.describe('Film mode (the reference video look)', () => {
  test('the app opens on the π film; after closing it, a reload stays in the lab', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('film')).toBeVisible()
    await expect(page.getByTestId('film-pi')).toContainText('π = 3.14159')
    await page.getByRole('button', { name: 'Close film' }).click()
    await expect(page.getByTestId('film')).toBeHidden()
    await page.reload()
    await expect(page.getByTestId('digit-stream')).toContainText('3.14159')
    await expect(page.getByTestId('film')).toHaveCount(0)
    // and the lab's button opens it again
    await page.getByRole('button', { name: '▶ π の模様を見る' }).click()
    await expect(page.getByTestId('film')).toBeVisible()
    await expect(page).toHaveURL(/#film$/)
  })

  test('#film opens full-screen, draws the π two-arm rule and speeds up; ✕ returns to the lab', async ({
    page,
  }) => {
    test.setTimeout(90_000)
    await page.goto('/#film')
    const film = page.getByTestId('film')
    await expect(film).toBeVisible()
    await expect(page.getByRole('button', { name: 'Export JSON' })).toBeHidden() // lab chrome hidden
    const time = async () => Number((await page.getByTestId('film-time').textContent())!.replace('T = ', ''))
    await expect.poll(time, { timeout: 60_000 }).toBeGreaterThan(2)

    // tap pauses, tap resumes
    await page.getByRole('button', { name: 'Pause film' }).click()
    // the worker's "paused" status comes after every batch it sent: read T once it has arrived
    await expect(page.getByRole('button', { name: 'Play film' })).toBeVisible()
    const paused = await time()
    await page.waitForTimeout(600)
    expect(await time()).toBe(paused)
    await page.getByRole('button', { name: 'Play film' }).click()
    await expect.poll(time).toBeGreaterThan(paused)

    // plain words first: π = 3.14…, the arms' turns, what is happening now
    await expect(page.getByTestId('film-pi')).toContainText('π = 3.14159265358979')
    await expect(page.getByTestId('film-counters')).toContainText('先 ÷ 根元')
    await expect(page.getByTestId('film-counters')).toContainText('3.14159')
    await expect(page.getByTestId('film-stage')).toContainText('π')

    // experts: the executed formulas with live values, and the convergents of π
    await page.getByRole('radio', { name: '専門' }).click()
    await expect(page.getByTestId('film-math')).toContainText('θ₂ = (n × dt × π) mod 2π = ')
    await expect(page.getByTestId('film-convergents')).toContainText('355/113')
    await expect(page.getByTestId('film-pi')).toContainText('3.14159265358979323846264338327950288419')

    // nothing, like the reference video
    await page.getByRole('radio', { name: '説明なし' }).click()
    await expect(page.getByTestId('film-panel')).toHaveCount(0)
    await expect(page.getByTestId('film-time')).toBeVisible()

    // the choice is remembered
    await page.reload()
    await expect(page.getByRole('radio', { name: '説明なし' })).toHaveAttribute('aria-checked', 'true')

    // the same rule as the Two-Arm preset
    await page.getByRole('button', { name: 'Close film' }).click()
    await expect(page).toHaveURL(/#lab$/)
    await expect(film).toBeHidden()
    await expect(page.getByTestId('formulas-current')).toContainText('θ₂ = (n × dt × π) mod 2π')
    await expect(page.getByRole('button', { name: 'Export JSON' })).toBeVisible()
  })
})

test.describe('Mathematical Microscope (spec §38)', () => {
  test('a step range is framed, picked and exported on its own; Exit shows everything again', async ({
    page,
  }) => {
    await page.goto('/#lab')
    await ready(page)
    await goTo(page, 400)
    await page.getByLabel('Microscope from step').fill('100')
    await page.getByLabel('Microscope to step').fill('150')
    await page.getByRole('button', { name: 'Zoom' }).click()
    await expect(page.getByTestId('microscope-badge-0')).toContainText('steps 100–150')
    await expect(page.getByTestId('microscope-range')).toHaveText('100–150')

    // clicks anywhere only ever select steps inside the range
    const canvas = page.getByTestId('lab-canvas')
    const box = (await canvas.boundingBox())!
    for (const [fx, fy] of [
      [0.5, 0.5],
      [0.3, 0.4],
      [0.7, 0.6],
      [0.45, 0.55],
    ]) {
      await page.mouse.click(box.x + box.width * fx!, box.y + box.height * fy!)
      await expect
        .poll(async () => Number((await page.getByTestId('inspector-step').textContent())!.replace(/,/g, '')))
        .toBeGreaterThanOrEqual(100)
      expect(
        Number((await page.getByTestId('inspector-step').textContent())!.replace(/,/g, '')),
      ).toBeLessThanOrEqual(150)
    }

    // SVG export = exactly the range
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'SVG', exact: true }).click(),
    ])
    expect(download.suggestedFilename()).toBe('pi-infinite-lab_digit-circle-walk_pi_100-150.svg')
    const svg = readFileSync(await download.path(), 'utf8')
    const steps = [...svg.matchAll(/data-step="(\d+)"/g)].map((m) => Number(m[1]))
    expect(steps).toHaveLength(102) // 51 steps × (path line + circle)
    expect(Math.min(...steps)).toBe(100)
    expect(Math.max(...steps)).toBe(150)

    // hidden context, then exit
    await page.getByRole('button', { name: 'hidden' }).click()
    await expect(page.getByRole('button', { name: 'hidden' })).toHaveAttribute('aria-pressed', 'true')
    await page.getByRole('button', { name: 'Exit microscope view' }).click()
    await expect(page.getByTestId('microscope-badge-0')).toHaveCount(0)
    await expect(page.getByTestId('timeline')).toContainText('400 / 1,001')
  })

  test('±50 around the inspected step; playing leaves the Microscope', async ({ page }) => {
    await page.goto('/#lab')
    await ready(page)
    await goTo(page, 300)
    await page.getByLabel('Inspect step').fill('200')
    await page.getByLabel('Inspect step').press('Enter')
    await expect(page.getByTestId('inspector-step')).toHaveText('200')
    await page.getByRole('button', { name: '±50', exact: true }).click()
    await expect(page.getByTestId('microscope-badge-0')).toContainText('steps 150–250')
    await page.getByRole('button', { name: 'Play' }).click()
    await expect(page.getByTestId('microscope-badge-0')).toHaveCount(0)
  })
})

test.describe('Video export (spec §28)', () => {
  test('records the drawing as WebM and MP4 (or explains why it cannot)', async ({ page }) => {
    test.setTimeout(120_000)
    await page.goto('/#lab')
    await ready(page)
    await goTo(page, 200)
    const hasEncoder = await page.evaluate(() => typeof VideoEncoder !== 'undefined')
    const button = page.getByRole('button', { name: 'Video', exact: true })
    if (!hasEncoder) {
      await expect(button).toBeDisabled()
      await expect(button).toHaveAttribute('title', /no WebCodecs/)
      return
    }
    await button.click()
    await page.getByLabel('Video length').selectOption('2')
    for (const format of ['webm', 'mp4'] as const) {
      await page.getByLabel('Video format').selectOption(format)
      const [download] = await Promise.all([
        page.waitForEvent('download', { timeout: 90_000 }),
        page.getByRole('button', { name: 'Record' }).click(),
      ])
      expect(download.suggestedFilename()).toBe(`pi-infinite-lab_digit-circle-walk_pi_200.${format}`)
      const bytes = readFileSync(await download.path())
      expect(bytes.length).toBeGreaterThan(20_000) // a blank or blurred video compresses to a few KB
      if (format === 'webm')
        expect(bytes.subarray(0, 4).toString('hex')).toBe('1a45dfa3') // EBML
      else expect(bytes.subarray(4, 8).toString('latin1')).toBe('ftyp')
      await expect(page.getByTestId('video-status')).toContainText(`saved`)
    }
    // the view is back where it was
    await expect(page.getByTestId('timeline')).toContainText('200 / 1,001')
  })
})
