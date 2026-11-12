import { expect, test, type Page, type Route } from '@playwright/test'

/**
 * The AI Guide with its providers mocked (no real keys or network): circle an area with the pen,
 * check what is sent, ask in 下 (GPT-6 Luna), ask again in 中 (GPT-6 Sol) and 上 (Opus 5.5).
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

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': '*',
}

type Sent = { url: string; body: Record<string, unknown>; headers: Record<string, string> }

async function mockProviders(page: Page, sent: Sent[]) {
  const record = (route: Route) =>
    sent.push({
      url: route.request().url(),
      body: route.request().postDataJSON(),
      headers: route.request().headers(),
    })
  await page.route('https://api.openai.com/**', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    record(route)
    const model = (route.request().postDataJSON() as { model: string }).model
    await route.fulfill({
      headers: CORS,
      json: {
        choices: [
          {
            message: {
              role: 'assistant',
              content:
                model === 'gpt-6-luna' ? '下の答え：トーラスのグラフです。' : '中の答え：くわしい説明です。',
            },
          },
        ],
        usage: { prompt_tokens: 3000, completion_tokens: 500 },
      },
    })
  })
  await page.route('https://api.deepseek.com/**', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    record(route)
    await route.fulfill({
      headers: CORS,
      json: { choices: [{ message: { content: 'DeepSeek の答えです。' } }] },
    })
  })
  await page.route('https://api.anthropic.com/**', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    record(route)
    await route.fulfill({
      headers: { ...CORS, 'content-type': 'application/json' },
      json: {
        id: 'msg_test',
        type: 'message',
        role: 'assistant',
        model: 'claude-opus-5-5',
        content: [{ type: 'text', text: '上の答え：いちばん詳しい説明です。' }],
        stop_reason: 'end_turn',
        stop_sequence: null,
        usage: { input_tokens: 3000, output_tokens: 500 },
      },
    })
  })
}

async function configure(page: Page) {
  await page.addInitScript(() =>
    localStorage.setItem(
      'pi-infinite-lab.guide.settings.v2',
      JSON.stringify({
        providers: {
          openai: { apiKey: 'test-key-openai' },
          claude: { apiKey: 'test-key-claude' },
          deepseek: { apiKey: 'test-key-ds' },
        },
      }),
    ),
  )
}

test('circle an area in the room; 下 answers, then ask again in 中 and 上', async ({ page }) => {
  const sent: Sent[] = []
  await mockProviders(page, sent)
  await configure(page)
  await page.goto('/#golden')
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

  // 下: GPT-6 Luna, OpenAI-compatible, picture attached, cost shown from the reported tokens
  const panel = page.getByTestId('guide-panel')
  await page.getByRole('button', { name: 'これは何？' }).click()
  await expect(panel).toContainText('下の答え')
  await expect(panel).toContainText('下・GPT-6 Luna・約 0.08 円')
  const first = sent[0]!
  expect(first.url).toBe('https://api.openai.com/v1/chat/completions')
  expect(first.headers['authorization']).toBe('Bearer test-key-openai')
  expect(first.body.model).toBe('gpt-6-luna')
  const user = (first.body.messages as { content: unknown }[]).at(-1)!.content as {
    type: string
    text?: string
    image_url?: { url: string }
  }[]
  expect(user.find((p) => p.type === 'image_url')!.image_url!.url).toMatch(/^data:image\/png;base64,/)
  const text = user.find((p) => p.type === 'text')!.text!
  expect(text).toContain('【画面の場所】φ と π の部屋 › 4 トーラスを埋める速さ')
  expect(text).toContain('根元の腕の周回数') // the section's slider state, sent even outside the circle

  // 中: GPT-6 Sol with the same key; the 下 answer stays
  await page.getByRole('button', { name: /中で聞き直す/ }).click()
  await expect(panel).toContainText('中の答え')
  await expect(panel).toContainText('下の答え')
  expect(sent[1]!.body.model).toBe('gpt-6-sol')

  // 上: Claude Opus 5.5 through the Anthropic SDK in the browser
  await page.getByRole('button', { name: /上で聞き直す/ }).click()
  await expect(panel).toContainText('上の答え')
  await expect(panel).toContainText('上・Claude Opus 5.5・約 3.3 円')
  const deep = sent.find((s) => s.url.startsWith('https://api.anthropic.com'))!
  expect(deep.headers['x-api-key']).toBe('test-key-claude')
  expect(deep.headers['anthropic-dangerous-direct-browser-access']).toBe('true')
  expect(deep.body.model).toBe('claude-opus-5-5')
  const content = (deep.body.messages as { content: { type: string }[] }[])[0]!.content
  expect(content[0]!.type).toBe('image')
  await expect(page.getByRole('button', { name: /で聞き直す/ })).toHaveCount(0) // nothing above 上

  // typing in the guide does not reach the lab or close the room
  await page.getByLabel('質問').fill('a b')
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('golden-room')).toBeVisible()
})

test('the 下 model can be switched in the panel; without a key the guide says what to set', async ({
  page,
}) => {
  const sent: Sent[] = []
  await mockProviders(page, sent)
  await configure(page)
  await page.goto('/#lab')
  await expect(page.getByTestId('digit-stream')).toContainText('3.14159')
  const canvas = page.getByTestId('lab-canvas')
  const box = (await canvas.boundingBox())!
  await circle(page, box.x + box.width / 2, box.y + box.height / 2, 80)
  await expect(page.getByTestId('guide-attachment')).toBeVisible()

  await page.getByLabel('まず答える AI').selectOption('deepseek-flash')
  await page.getByRole('button', { name: 'これは何？' }).click()
  await expect(page.getByTestId('guide-panel')).toContainText('DeepSeek の答えです。')
  expect(sent[0]!.url).toBe('https://api.deepseek.com/chat/completions')
  expect(sent[0]!.body.model).toBe('deepseek-flash')

  await page.getByLabel('まず答える AI').selectOption('minimax-m3')
  await page.getByRole('button', { name: 'なぜこうなるの？' }).click()
  await expect(page.getByTestId('guide-panel')).toContainText('MiniMax の API キーが未設定です')
  await expect(page.getByTestId('guide-settings')).toBeVisible()
})
