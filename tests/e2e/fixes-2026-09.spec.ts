import { expect, test, type Page } from '@playwright/test'

// Problems found in the real-device check of 2026-09-26 (docs/device-checks/2026-09-26.md).

async function ready(page: Page) {
  await expect(page.getByTestId('digit-stream')).toContainText('3.14159')
}

/** The panel is on screen and nothing covers or clips its centre and corners. */
async function expectFullyShown(page: Page) {
  const panel = page.getByTestId('video-panel')
  await expect(panel).toBeVisible()
  const box = (await panel.boundingBox())!
  const vw = page.viewportSize()!.width
  expect(box.x).toBeGreaterThanOrEqual(0)
  expect(box.x + box.width).toBeLessThanOrEqual(vw)
  const hits = await panel.evaluate((el) => {
    const r = el.getBoundingClientRect()
    const pts = [
      [r.left + r.width / 2, r.top + r.height / 2],
      [r.left + 4, r.top + 4],
      [r.right - 4, r.bottom - 4],
    ]
    return pts.map(([x, y]) => el.contains(document.elementFromPoint(x!, y!)))
  })
  expect(hits).toEqual([true, true, true])
  // nothing inside is wider than the panel (clipped), and Record is actually reachable
  const overflow = await panel.evaluate((el) => el.scrollWidth - el.clientWidth)
  expect(overflow).toBeLessThanOrEqual(0)
  const record = page.getByRole('button', { name: 'Record' })
  await expect(record).toBeInViewport({ ratio: 1 })
  const rb = (await record.boundingBox())!
  expect(rb.x + rb.width).toBeLessThanOrEqual(box.x + box.width)
  // hit-testable: the element at Record's centre is Record (not covered or clipped)
  expect(
    await record.evaluate((el) => {
      const r = el.getBoundingClientRect()
      return el === document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
    }),
  ).toBe(true)
}

for (const [label, viewport] of [
  ['a narrow desktop window', { width: 800, height: 700 }],
  ['a phone', { width: 390, height: 844 }],
] as const) {
  test(`the Video panel is fully visible in ${label}`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await page.goto('/#lab')
    await ready(page)
    const hasEncoder = await page.evaluate(() => typeof VideoEncoder !== 'undefined')
    test.skip(!hasEncoder, 'no WebCodecs encoder: the Video button is disabled')
    const button = page.getByRole('button', { name: 'Video', exact: true })
    await button.scrollIntoViewIfNeeded()
    await button.click()
    await expectFullyShown(page)
  })
}

test('typing #film / #lab in the address bar switches the screen', async ({ page }) => {
  await page.goto('/#lab')
  await ready(page)
  await expect(page.getByTestId('film')).toHaveCount(0)
  await page.evaluate(() => (window.location.hash = '#film'))
  await expect(page.getByTestId('film')).toBeVisible()
  await page.evaluate(() => (window.location.hash = '#lab'))
  await expect(page.getByTestId('film')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Export JSON' })).toBeVisible()
  // back returns to the film URL, and the film with it
  await page.goBack()
  await expect(page).toHaveURL(/#film$/)
  await expect(page.getByTestId('film')).toBeVisible()
})
