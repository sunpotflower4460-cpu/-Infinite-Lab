import { expect, test } from '@playwright/test'

const num = (s: string | null) => Number((s ?? '').replace(/[^0-9]/g, ''))

test('vertical slice: compute π → play → pause → step → inspect → reset', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(String(e)))
  await page.goto('/#lab')

  // π computed (1,000 digits by default) and the rule is shown before anything runs.
  await expect(page.getByTestId('digit-stream')).toContainText('3.14159265358979')
  await expect(page.getByTestId('formulas-current')).toContainText('angle = digit / 10 × 2π')
  await expect(page.getByTestId('current-step')).toHaveText('0')

  // Step once: π's first digit is 3.
  await page.getByRole('button', { name: 'Step' }).click()
  await expect(page.getByTestId('current-step')).toHaveText('1')
  await expect(page.getByTestId('current-digit')).toHaveText('3')
  await expect(page.getByTestId('inspector')).toContainText('3 / 10 × 2π')
  await expect(page.getByTestId('objects')).toHaveText('2') // path line + circle

  // Play at 100x, then pause.
  await page.getByRole('radio', { name: '100x' }).click()
  await page.getByRole('button', { name: 'Play' }).click()
  await expect.poll(async () => num(await page.getByTestId('current-step').textContent())).toBeGreaterThan(50)
  await page.getByRole('button', { name: 'Pause' }).click()
  // The Play button returns only after the worker's pause status, which follows every earlier batch.
  await expect(page.getByRole('button', { name: 'Play' })).toBeVisible()
  const paused = num(await page.getByTestId('current-step').textContent())
  await page.waitForTimeout(300)
  expect(num(await page.getByTestId('current-step').textContent())).toBe(paused)

  // Step advances by exactly one.
  await page.getByRole('button', { name: 'Step' }).click()
  await expect(page.getByTestId('current-step')).toHaveText(
    String(paused + 1).replace(/\B(?=(\d{3})+(?!\d))/g, ','),
  )

  // Inspect step 6 → digit 9 (π = 3.14159…).
  await page.getByLabel('Inspect step').fill('6')
  await page.getByRole('button', { name: 'Inspect' }).click()
  await expect(page.getByTestId('inspector-step')).toHaveText('6')
  await expect(page.getByTestId('inspector')).toContainText('9 / 10 × 2π')

  // Camera interaction does not change the mathematics.
  const canvas = page.getByTestId('lab-canvas')
  const box = (await canvas.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.wheel(0, -400)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 + 80, box.y + box.height / 2 + 40)
  await page.mouse.up()
  expect(num(await page.getByTestId('current-step').textContent())).toBe(paused + 1)
  await page.screenshot({ path: 'test-results/lab.png' })

  // Reset.
  await page.getByRole('button', { name: 'Reset' }).click()
  await expect(page.getByTestId('current-step')).toHaveText('0')
  await expect(page.getByTestId('objects')).toHaveText('0')

  expect(errors).toEqual([])
})

test('MAX speed consumes all digits and stops', async ({ page }) => {
  await page.goto('/#lab')
  await expect(page.getByTestId('digit-stream')).toContainText('3.14159')
  await page.getByRole('radio', { name: 'MAX' }).click()
  await page.getByRole('button', { name: 'Play' }).click()
  await expect(page.getByTestId('current-step')).toHaveText('1,001') // "3" + 1,000 decimals
  await expect(page.getByText('all computed digits consumed')).toBeVisible()
  await expect(page.getByTestId('objects')).toHaveText('2,002')
})

test('parameter edits apply on Enter, are clamped, and restart the experiment', async ({ page }) => {
  await page.goto('/#lab')
  await expect(page.getByTestId('digit-stream')).toContainText('3.14159')
  await page.getByRole('button', { name: 'Step' }).click()
  await expect(page.getByTestId('current-step')).toHaveText('1')

  const distance = page.getByLabel('DISTANCE')
  await distance.fill('')
  // An empty draft must not snap to the minimum or restart anything.
  await expect(page.getByTestId('current-step')).toHaveText('1')
  await distance.fill('25')
  await distance.press('Enter')
  await expect(page.getByTestId('current-step')).toHaveText('0')
  await expect(distance).toHaveValue('25')

  await page.getByRole('button', { name: 'Step' }).click()
  await expect(page.getByTestId('inspector')).toContainText('× 25')

  await distance.fill('100000')
  await distance.press('Enter')
  await expect(distance).toHaveValue('100') // clamped to max
})
