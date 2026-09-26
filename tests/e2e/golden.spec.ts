import { expect, test } from '@playwright/test'

test.describe('φ and π room (#golden)', () => {
  test('opens from the lab, shows every section with computed values, and closes back to the lab', async ({
    page,
  }) => {
    await page.goto('/#lab')
    await expect(page.getByTestId('digit-stream')).toContainText('3.14159')
    await page.getByRole('button', { name: 'φ と π の部屋' }).click()
    await expect(page).toHaveURL(/#golden$/)
    const room = page.getByTestId('golden-room')
    await expect(room).toBeVisible()
    for (const id of ['pentagon', 'sunflower', 'fractions', 'torus', 'kam', 'coincidence'])
      await expect(page.getByTestId(`room-${id}`)).toBeVisible()

    // 1: diagonal / side measured on the drawn pentagon
    await expect(page.getByTestId('room-pentagon')).toContainText('1.618033988749895')
    // 3: the continued fractions, computed from the certified digits
    await expect(page.getByTestId('room-fractions')).toContainText('π = [3, 7, 15, 1, 292')
    await expect(page.getByTestId('room-fractions')).toContainText('355/113')
    // 5: at K = 0.6 the π − 3 circle is broken, the golden one survives
    const kam = page.getByTestId('kam-table')
    await expect(kam.getByRole('row', { name: /π − 3/ })).toContainText('壊れた')
    await expect(kam.getByRole('row', { name: /黄金比/ })).toContainText('残っている')
    await page.getByRole('button', { name: 'K = 1.2' }).click()
    await expect(kam).toContainText('K = 1.200')
    await expect(kam.getByRole('row', { name: /黄金比/ })).toContainText('壊れた')
    // 6: the coincidence and its size
    await expect(page.getByTestId('room-coincidence')).toContainText('0.096%')

    // Back (or ✕) returns to the lab
    await page.getByRole('button', { name: 'Close the room' }).click()
    await expect(room).toHaveCount(0)
    await expect(page).toHaveURL(/#lab$/)
    await expect(page.getByRole('button', { name: 'Export JSON' })).toBeVisible()
  })

  test('#golden opens the room directly (not the film), and the address bar switches screens', async ({
    page,
  }) => {
    await page.goto('/#golden')
    await expect(page.getByTestId('golden-room')).toBeVisible()
    await expect(page.getByTestId('film')).toHaveCount(0)
    await page.evaluate(() => (window.location.hash = '#film'))
    await expect(page.getByTestId('golden-room')).toHaveCount(0)
    await expect(page.getByTestId('film')).toBeVisible()
    await page.evaluate(() => (window.location.hash = '#golden'))
    await expect(page.getByTestId('golden-room')).toBeVisible()
    await expect(page.getByTestId('film')).toHaveCount(0)
    await expect(page).toHaveURL(/#golden$/) // leaving the film must not rewrite it to #lab
  })

  test('the wall test reports a crossing above the golden circle’s breaking point', async ({ page }) => {
    test.setTimeout(60_000)
    await page.goto('/#golden')
    await page.getByRole('button', { name: 'K = 1.2' }).click()
    await page.getByRole('button', { name: /壁」になっているか試す/ }).click()
    await expect(page.getByTestId('kam-wall')).toContainText('抜けました', { timeout: 30_000 })
  })
})
