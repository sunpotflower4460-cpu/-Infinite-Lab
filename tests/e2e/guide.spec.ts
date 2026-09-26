import { expect, test, type Page } from '@playwright/test'

/**
 * The AI Guide with its providers mocked (no real keys or network): circle an area with the pen,
 * check what would be sent, ask in the "ふつう" tier (OpenAI-compatible), then re-ask in the
 * "じっくり" tier (Anthropic Messages API).
 */

async function circle(page: Page, cx: number, cy: number, r: number) {
  await page.getByRole('button', { name: '✎ 囲んで聞く' }).first().click()
  await expect(page.getByTestId('guide-pen')).toBeVisible()
  await page.mouse.move(cx + r, cy)
  await page.mouse.down()
  for (let i = 1; i <= 36; i++) {
    const a = (i / 36) * 2 * Math.PI
    await page.mouse.move(cx + r * Math.cos(a), cy + r * Math.sin(a))
  }
  await page.mouse.up()
}

async function configure(page: Page) {
  await page.evaluate(() =>
    localStorage.setItem(
      'pi-infinite-lab.guide.settings',
      JSON.stringify({
        tiers: { normal: 'qwen', deep: 'claude' },
        providers: {
          qwen: { apiKey: 'test-key-qwen', model: 'test-vl-model', vision: true },
          claude: { apiKey: 'test-key-claude', model: 'claude-opus-5' },
        },
      }),
    ),
  )
}

test('circle an area in the room, ask it, then ask deeper', async ({ page }) => {
  const sent: { url: string; body: Record<string, unknown>; headers: Record<string, string> }[] = []
  await page.route('https://dashscope-intl.aliyuncs.com/**', async (route) => {
    sent.push({
      url: route.request().url(),
      body: route.request().postDataJSON(),
      headers: route.request().headers(),
    })
    await route.fulfill({
      json: {
        choices: [
          { message: { role: 'assistant', content: 'これは**トーラスを埋める速さ**のグラフです。' } },
        ],
      },
      headers: { 'access-control-allow-origin': '*' },
    })
  })
  await page.route('https://api.anthropic.com/**', async (route) => {
    if (route.request().method() === 'OPTIONS')
      return route.fulfill({
        status: 204,
        headers: {
          'access-control-allow-origin': '*',
          'access-control-allow-headers': '*',
          'access-control-allow-methods': '*',
        },
      })
    sent.push({
      url: route.request().url(),
      body: route.request().postDataJSON(),
      headers: route.request().headers(),
    })
    await route.fulfill({
      headers: { 'access-control-allow-origin': '*', 'content-type': 'application/json' },
      json: {
        id: 'msg_test',
        type: 'message',
        role: 'assistant',
        model: 'claude-opus-5',
        content: [{ type: 'text', text: 'じっくり版の説明です。' }],
        stop_reason: 'end_turn',
        stop_sequence: null,
        usage: { input_tokens: 10, output_tokens: 5 },
      },
    })
  })

  await page.goto('/#golden')
  await configure(page)
  await page.reload()
  await expect(page.getByTestId('golden-room')).toBeVisible()
  await page.getByTestId('room-torus').scrollIntoViewIfNeeded()
  const chart = page.getByRole('img', { name: '埋まった割合のグラフ' })
  const box = (await chart.boundingBox())!
  await circle(page, box.x + box.width / 2, box.y + box.height / 2, Math.min(box.width, box.height) / 2)

  // the attachment: a picture, the place, the text inside and the section's live state
  const attach = page.getByTestId('guide-attachment')
  await expect(attach).toBeVisible()
  await expect(attach.locator('img')).toHaveAttribute('src', /^data:image\/png;base64,/)
  await expect(attach).toContainText('φ と π の部屋 › 4 トーラスを埋める速さ')

  // ask (ふつう → Qwen, OpenAI-compatible, picture attached)
  await page.getByRole('button', { name: 'これは何？' }).click()
  await expect(page.getByTestId('guide-panel')).toContainText('トーラスを埋める速さ')
  const first = sent[0]!
  expect(first.url).toBe('https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions')
  expect(first.headers['authorization']).toBe('Bearer test-key-qwen')
  const msgs = first.body.messages as { role: string; content: unknown }[]
  expect(msgs[0]!.role).toBe('system')
  const user = msgs.at(-1)!.content as { type: string; text?: string; image_url?: { url: string } }[]
  expect(user.find((p) => p.type === 'image_url')!.image_url!.url).toMatch(/^data:image\/png;base64,/)
  const text = user.find((p) => p.type === 'text')!.text!
  expect(text).toContain('【画面の場所】φ と π の部屋 › 4 トーラスを埋める速さ')
  expect(text).toContain('【質問】これは何？')
  expect(text).toContain('根元の腕の周回数') // the section's slider state, sent even outside the circle

  // じっくり → Claude (Anthropic Messages API from the browser)
  await page.getByRole('button', { name: /じっくり聞き直す/ }).click()
  await expect(page.getByTestId('guide-panel')).toContainText('じっくり版の説明です。')
  await expect(page.getByTestId('guide-panel')).toContainText('これは') // the first answer stays
  const deep = sent.find((s) => s.url.startsWith('https://api.anthropic.com'))!
  expect(deep.url).toContain('/v1/messages')
  expect(deep.headers['x-api-key']).toBe('test-key-claude')
  expect(deep.headers['anthropic-dangerous-direct-browser-access']).toBe('true')
  expect(deep.body.model).toBe('claude-opus-5')
  const content = (deep.body.messages as { content: { type: string; source?: { type: string } }[] }[])[0]!
    .content
  expect(content[0]!.type).toBe('image')
  expect(content[0]!.source!.type).toBe('base64')

  // typing a space in the guide does not reach the lab or close the room
  await page.getByLabel('質問').fill('a b')
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('golden-room')).toBeVisible()
})

test('without a key the guide says what to set, and the pen works in the lab too', async ({ page }) => {
  await page.goto('/#lab')
  await expect(page.getByTestId('digit-stream')).toContainText('3.14159')
  const canvas = page.getByTestId('lab-canvas')
  const box = (await canvas.boundingBox())!
  await circle(page, box.x + box.width / 2, box.y + box.height / 2, 80)
  await expect(page.getByTestId('guide-attachment')).toBeVisible()
  await page.getByRole('button', { name: 'これは何？' }).click()
  await expect(page.getByTestId('guide-panel')).toContainText('API キーが未設定です')
  await expect(page.getByTestId('guide-settings')).toBeVisible()
})
