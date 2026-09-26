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
    await page.goto('/')
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
    await page.goto('/')
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
    await page.goto('/')
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
    await expect(film).toBeHidden()
    await expect(page.getByTestId('formulas-current')).toContainText('θ₂ = (n × dt × π) mod 2π')
    await expect(page.getByRole('button', { name: 'Export JSON' })).toBeVisible()
  })
})
