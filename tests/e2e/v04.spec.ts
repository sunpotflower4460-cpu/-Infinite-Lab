import { readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'

async function ready(page: Page) {
  await expect(page.getByTestId('digit-stream')).toContainText('3.14159')
}

test('Two-Arm preset shows the exact angle formulas and the arms overlay', async ({ page }) => {
  await page.goto('/#lab')
  await ready(page)
  await page.getByTestId('preset').selectOption('pi-two-arm')
  await expect(page.getByTestId('status')).toContainText('100,000 digits')
  await expect(page.getByTestId('formulas-current')).toContainText('θ₂ = (n × dt × π) mod 2π')
  await page.getByLabel('Go to step').fill('300')
  await page.getByLabel('Go to step').press('Enter')
  await expect(page.getByTestId('current-step')).toHaveText('300')
  await expect(page.getByTestId('inspector')).toContainText('(300 × 0.05 × π) mod 2π')
})

test('patterns are measured facts; the AI answer is shown as an unverified conjecture', async ({ page }) => {
  let sent: { auth?: string; body?: string } = {}
  await page.route('https://api.deepseek.com/chat/completions', async (route) => {
    sent = { auth: route.request().headers()['authorization'], body: route.request().postData() ?? '' }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify({
        choices: [
          {
            message: {
              content: '1. 観測: 15回対称が最も強い。\n2. 推測（未検証）: π≈22/7 に由来する可能性。',
            },
          },
        ],
      }),
    })
  })
  await page.goto('/#lab')
  await ready(page)
  await page.getByTestId('preset').selectOption('pi-two-arm')
  await expect(page.getByTestId('status')).toContainText('100,000 digits')
  await page.getByLabel('Go to step').fill('1400') // t = 70: the 15-petal stage
  await page.getByLabel('Go to step').press('Enter')
  await expect(page.getByTestId('current-step')).toHaveText('1,400')

  await page.getByRole('button', { name: 'Measure patterns' }).click()
  await expect(page.getByTestId('facts')).toContainText('15-fold')
  await expect(page.getByTestId('facts')).toContainText('χ²(9)')

  await page.getByLabel('DeepSeek API key').fill('sk-e2e-secret')
  await page.getByRole('button', { name: 'Ask AI' }).click()
  await expect(page.getByTestId('ai-answer')).toContainText('AI の推測（未検証）')
  await expect(page.getByTestId('ai-answer')).toContainText('数学的な証明ではありません')
  expect(sent.auth).toBe('Bearer sk-e2e-secret')
  const payload = JSON.parse(sent.body!)
  const data = JSON.parse(payload.messages[1].content.replace(/^Experiment data \(JSON\):\n/, ''))
  expect(data.formulas).toContain('θ₂ = (n × dt × π) mod 2π')
  expect(data.facts.symmetry[0]).toMatchObject({ order: 15, significant: true }) // the 15-petal stage, measured
  expect(sent.body).not.toContain('sk-e2e-secret')

  // the key never ends up in an export
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Export JSON' }).click(),
  ])
  expect(readFileSync(await download.path(), 'utf8')).not.toContain('sk-e2e-secret')
})

test('AI errors are reported, not hidden', async ({ page }) => {
  await page.route('https://api.deepseek.com/chat/completions', (route) =>
    route.fulfill({ status: 401, headers: { 'access-control-allow-origin': '*' }, body: '{}' }),
  )
  await page.goto('/#lab')
  await ready(page)
  await page.getByRole('button', { name: 'Step' }).click()
  await page.getByLabel('DeepSeek API key').fill('bad')
  await page.getByRole('button', { name: 'Ask AI' }).click()
  await expect(page.getByTestId('observer')).toContainText('rejected')
})
