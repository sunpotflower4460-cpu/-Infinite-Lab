import { expect, test } from '@playwright/test'

/**
 * The rhythm textbook (#rhythm): every chapter is there, and the live measurements give the report's
 * results (the laws themselves are checked against the report in tests/unit/rhythm).
 */
test.describe('rhythm textbook (#rhythm)', () => {
  test('opens from the lab; the number line, the kicked top and one cell give the report’s results', async ({
    page,
  }) => {
    test.slow()
    await page.goto('/#lab')
    await expect(page.getByTestId('digit-stream')).toContainText('3.14159')
    await page.getByRole('button', { name: 'リズムの教科書' }).click()
    await expect(page).toHaveURL(/#rhythm$/)
    const room = page.getByTestId('rhythm-room')
    await expect(room).toBeVisible()
    for (const id of [
      'two',
      'near',
      'top',
      'cell',
      'tongues',
      'box',
      'plane',
      'heart',
      'meaning',
      'terms',
      'numbers',
    ])
      await expect(page.getByTestId(`room-${id}`)).toBeAttached()

    // 1: the knocks are counted
    await expect(page.getByTestId('room-two')).toContainText(/コツン [1-9]\d* 回/)

    // 2: 1/π sits on 7/22 and 113/355; 1/φ's nearest fraction is far
    const near = page.getByTestId('room-near')
    await near.scrollIntoViewIfNeeded()
    await near.getByRole('button', { name: '1/π を 2500 倍' }).click()
    await expect(near.locator('svg text', { hasText: '7/22' })).toHaveCount(1)
    await expect(near.locator('svg text', { hasText: '113/355' })).toHaveCount(1)
    await expect(near).toContainText('1/π にいちばん近い分数：113/355（ずれ 2.7e-8）')
    await expect(near).toContainText('1/φ にいちばん近い分数：233/377（ずれ 3.1e-6）')

    // 3: at K = 0.972 only the golden circle is left (the report's scan, run in a worker)
    const top = page.getByTestId('room-top')
    await top.scrollIntoViewIfNeeded()
    await top.getByRole('button', { name: 'K = 0.972' }).click()
    const table = top.locator('table')
    await expect(table.getByRole('row', { name: /黄金比/ })).toContainText('残っている（0.618', {
      timeout: 60_000,
    })
    await expect(table.getByRole('row', { name: /1\/π/ })).toContainText('壊れた')
    await expect(table.getByRole('row', { name: /√2 − 1/ })).toContainText('壊れた')

    // 4: one cell — 1/π at γ = 0.05 is captured by 1/3, the golden beat stays free, and at 0.1 it is 3/5
    const cell = page.getByTestId('room-cell')
    await cell.scrollIntoViewIfNeeded()
    await expect(cell.locator('.room-verdict')).toContainText('1/3 に取り込まれた')
    await cell.getByRole('button', { name: '1/φ（黄金比）' }).click()
    await expect(cell.locator('.room-verdict')).toContainText('自由')
    await cell
      .getByRole('group', { name: '拍子の強さ γ' })
      .getByRole('button', { name: '0.1', exact: true })
      .click()
    await expect(cell.locator('.room-verdict')).toContainText('3/5 に取り込まれた')

    // 5: the tongue map sets the cell: bottom-left is s = 0.30 with no beat (0.3 is exactly 3/10: not a capture)
    const map = page.getByTestId('tongue-map')
    await map.scrollIntoViewIfNeeded()
    const box = (await map.boundingBox())!
    await map.click({ position: { x: 2, y: box.height - 4 } })
    await expect(cell.locator('.room-verdict')).toContainText('s = 0.300・γ = 0.000')
    await expect(cell.locator('.room-verdict')).toContainText('拍子なし。比がちょうど 3/10')

    // Escape closes the room back to the lab
    await page.keyboard.press('Escape')
    await expect(room).toHaveCount(0)
    await expect(page).toHaveURL(/#lab$/)
  })

  test('the 3D box under a 1/π beat is captured whole by 1/3, measured live', async ({ page }) => {
    test.setTimeout(240_000)
    await page.goto('/#rhythm')
    const sec = page.getByTestId('room-box')
    await sec.scrollIntoViewIfNeeded()
    await expect(sec).toContainText('早送りで落ち着かせています')
    await expect(sec.locator('.room-verdict')).toContainText('取り込まれた割合 100%（1/3 に 100%）', {
      timeout: 200_000,
    })
    await expect(sec.locator('.room-verdict')).toContainText('渦の線 0')
  })

  test('the 2D plane grows spirals; the golden room links here', async ({ page }) => {
    test.setTimeout(120_000)
    await page.goto('/#golden')
    await page.getByTestId('room-summary').scrollIntoViewIfNeeded()
    await page.getByRole('button', { name: 'リズムの教科書へ →' }).click()
    await expect(page).toHaveURL(/#rhythm$/)
    const plane = page.getByTestId('room-plane')
    await plane.scrollIntoViewIfNeeded()
    await expect(plane).toContainText(/らせんの中心 ([1-9]\d*) 個/, { timeout: 90_000 })
    // ✕ goes back to the golden room it was opened from
    await page.getByRole('button', { name: 'Close the room' }).click()
    await expect(page.getByTestId('golden-room')).toBeVisible()
  })
})
