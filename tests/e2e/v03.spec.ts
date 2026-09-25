import { expect, test, type Page } from '@playwright/test'

async function ready(page: Page, text = '3.14159') {
  await expect(page.getByTestId('digit-stream')).toContainText(text)
}

/** Number of clearly lit pixels in the canvas screenshot (WebGL buffers can't be read back directly). */
async function litPixels(page: Page): Promise<number> {
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
    let n = 0
    for (let i = 0; i < d.length; i += 4) if (d[i]! + d[i + 1]! + d[i + 2]! > 150) n++
    return n
  }, png)
}

test('both geometry layers draw the same structure', async ({ page }) => {
  await page.goto('/')
  await ready(page)
  await page.getByLabel('Go to step').fill('1000')
  await page.getByLabel('Go to step').press('Enter')
  await expect(page.getByTestId('current-step')).toHaveText('1,000')
  await page.getByText('Scientific Mode').first().click()
  await page.getByText('Scientific Mode').first().click() // hide the overlay again for the pixel count
  await page.waitForTimeout(300)
  const instanced = await litPixels(page)
  await page.getByText('Scientific Mode').first().click()
  await page.getByLabel('Geometry layer').selectOption('graphics')
  await page.getByText('Scientific Mode').first().click()
  await page.waitForTimeout(500)
  const graphics = await litPixels(page)
  expect(instanced).toBeGreaterThan(5000)
  expect(graphics).toBeGreaterThan(5000)
  expect(Math.abs(instanced - graphics) / graphics).toBeLessThan(0.5) // same shapes, different anti-aliasing
})
