import { describe, expect, it } from 'vitest'
import { askGuide, attachmentText, GuideError, openAiBody, type Attachment } from '../../../src/guide/ask'
import {
  CLASS_ORDER,
  costOf,
  defaultSettings,
  endpointFor,
  MODELS,
  notReady,
  typicalYen,
  type Endpoint,
} from '../../../src/guide/providers'

const IMG = 'data:image/png;base64,iVBORw0KGgo='
const attachment: Attachment = {
  image: IMG,
  place: 'φ と π の部屋 › 5 KAM',
  text: ['揺さぶりの強さ K：0.600'],
  state: { room: { page: 'φ と π の部屋' } },
}

function endpoint(modelId: string, patch: Partial<Endpoint> = {}): Endpoint {
  const s = defaultSettings()
  return { ...endpointFor(s, modelId), apiKey: 'k', ...patch }
}

function recorder(response: unknown, status = 200) {
  const calls: { url: string; init: RequestInit }[] = []
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} })
    return new Response(JSON.stringify(response), { status, headers: { 'content-type': 'application/json' } })
  }) as typeof fetch
  return { calls, fetchImpl }
}

const anthropicReply = (model: string, text = '答え', stop = 'end_turn') => ({
  id: 'msg_1',
  type: 'message',
  role: 'assistant',
  model,
  content: text ? [{ type: 'text', text }] : [],
  stop_reason: stop,
  stop_sequence: null,
  usage: { input_tokens: 3000, output_tokens: 500 },
})

describe('AI Guide: classes and prices', () => {
  it('three classes: 下 answers first with several choices, then 中, then 上 (Opus 5.5)', () => {
    const d = defaultSettings()
    expect(CLASS_ORDER).toEqual(['light', 'standard', 'deep'])
    expect(MODELS.filter((m) => m.class === 'light').map((m) => m.id)).toEqual([
      'gpt-6-luna',
      'deepseek-flash',
      'qwen-flash',
      'minimax-m3',
    ])
    expect(MODELS.filter((m) => m.class === 'standard').map((m) => m.id)).toEqual([
      'gpt-6-sol',
      'qwen-max',
      'claude-sonnet-5',
    ])
    expect(d.choice).toEqual({ light: 'gpt-6-luna', standard: 'gpt-6-sol', deep: 'claude-opus-5-5' })
    // one key per company: Luna (下) and Sol (中) both use the OpenAI key
    d.providers.openai.apiKey = 'sk-o'
    expect(endpointFor(d, 'gpt-6-luna')).toMatchObject({ apiKey: 'sk-o', model: 'gpt-6-luna' })
    expect(endpointFor(d, 'gpt-6-sol')).toMatchObject({ apiKey: 'sk-o', model: 'gpt-6-sol' })
  })

  it('cost from the reported tokens: 下 ~0.1 yen, 中 ~1–2 yen, 上 ~3 yen a question', () => {
    expect(costOf('gpt-6-luna', { input: 3000, output: 500 })).toBeCloseTo(0.00055, 8)
    expect(costOf('claude-opus-5-5', { input: 3000, output: 500 })).toBeCloseTo(0.022, 8)
    expect(costOf('gpt-6-sol', null)).toBeNull()
    expect(typicalYen('gpt-6-luna')).toBe('約 0.08 円')
    expect(typicalYen('deepseek-flash')).toBe('約 0.11 円')
    expect(typicalYen('gpt-6-sol')).toBe('約 1.6 円')
    expect(typicalYen('claude-opus-5-5')).toBe('約 3.3 円')
  })

  it('says what is missing before asking', () => {
    const d = defaultSettings()
    expect(notReady(endpointFor(d, 'claude-opus-5-5'))).toContain('Anthropic（Claude） の API キー')
    expect(notReady(endpoint('gpt-6-sol', { model: ' ' }))).toContain('モデル名')
    expect(notReady(endpoint('deepseek-flash'))).toBeNull()
  })
})

describe('AI Guide requests', () => {
  it('the first question carries the place, the circled text, the page state and the question', () => {
    const t = attachmentText(attachment, 'これは何？', true)
    expect(t).toContain('【画面の場所】φ と π の部屋 › 5 KAM')
    expect(t).toContain('画像を添付しています')
    expect(t).toContain('揺さぶりの強さ K：0.600')
    expect(t).toContain('"page": "φ と π の部屋"')
    expect(t.trim().endsWith('【質問】これは何？')).toBe(true)
    expect(attachmentText(attachment, 'q', false)).toContain('画像は送っていません')
  })

  it('OpenAI-compatible: system prompt, history, and the picture as image_url', () => {
    const b = openAiBody(
      'm',
      [
        { role: 'user', text: 'a' },
        { role: 'assistant', text: 'b' },
      ],
      'c',
      IMG,
    )
    expect(b.messages.map((m) => m.role)).toEqual(['system', 'user', 'assistant', 'user'])
    expect(b.messages.at(-1)!.content).toEqual([
      { type: 'text', text: 'c' },
      { type: 'image_url', image_url: { url: IMG } },
    ])
    expect(openAiBody('m', [], 'c', null).messages.at(-1)!.content).toBe('c')
  })

  it('Luna (下): the picture as image_url, and the reported tokens come back for the cost', async () => {
    const { calls, fetchImpl } = recorder({
      choices: [{ message: { content: 'ok' } }],
      usage: { prompt_tokens: 1200, completion_tokens: 300 },
    })
    const a = await askGuide({
      endpoint: endpoint('gpt-6-luna'),
      attachment,
      history: [],
      question: 'q',
      fetchImpl,
    })
    expect(a).toMatchObject({
      text: 'ok',
      modelId: 'gpt-6-luna',
      sentImage: true,
      usage: { input: 1200, output: 300 },
    })
    expect(calls[0]!.url).toBe('https://api.openai.com/v1/chat/completions')
    const body = JSON.parse(String(calls[0]!.init.body))
    expect(body.model).toBe('gpt-6-luna')
    expect(body.messages.at(-1).content[1]).toEqual({ type: 'image_url', image_url: { url: IMG } })
  })

  it('a model set to text only gets no picture, and is told so', async () => {
    const { calls, fetchImpl } = recorder({ choices: [{ message: { content: 'ok' } }] })
    const a = await askGuide({
      endpoint: endpoint('deepseek-flash', { vision: false }),
      attachment,
      history: [],
      question: 'q',
      fetchImpl,
    })
    expect(a).toMatchObject({ sentImage: false, usage: null })
    expect(calls[0]!.url).toBe('https://api.deepseek.com/chat/completions')
    const body = JSON.parse(String(calls[0]!.init.body))
    expect(body.messages.at(-1).content).toContain('画像は送っていません')
  })

  it('follow-up questions resend the attachment text as the first turn, without the picture', async () => {
    const { calls, fetchImpl } = recorder({ choices: [{ message: { content: 'ok' } }] })
    await askGuide({
      endpoint: endpoint('qwen-flash'),
      attachment,
      history: [
        { role: 'user', text: 'これは何？' },
        { role: 'assistant', text: 'KAM の図です' },
      ],
      question: 'もっと',
      fetchImpl,
    })
    expect(calls[0]!.url).toBe('https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions')
    const msgs = JSON.parse(String(calls[0]!.init.body)).messages
    expect(msgs[1].content).toContain('【画面の場所】φ と π の部屋 › 5 KAM')
    expect(msgs.at(-1).content).toBe('もっと')
  })

  it('Opus 5.5 (上): the picture as a base64 image block, server-side fallbacks, tokens reported', async () => {
    const { calls, fetchImpl } = recorder(anthropicReply('claude-opus-5-5'))
    const a = await askGuide({
      endpoint: endpoint('claude-opus-5-5', { apiKey: 'sk-test' }),
      attachment,
      history: [],
      question: 'q',
      fetchImpl,
    })
    expect(a).toMatchObject({ text: '答え', sentImage: true, usage: { input: 3000, output: 500 } })
    expect(calls[0]!.url).toContain('https://api.anthropic.com/v1/messages')
    const body = JSON.parse(String(calls[0]!.init.body))
    expect(body.model).toBe('claude-opus-5-5')
    expect(body.fallbacks).toBe('default')
    expect(body.thinking).toBeUndefined() // Opus 5.5 rejects disabling it; the default is adaptive
    expect(body.messages[0].content[0]).toEqual({
      type: 'image',
      source: { type: 'base64', media_type: 'image/png', data: 'iVBORw0KGgo=' },
    })
    const headers = new Headers(calls[0]!.init.headers)
    expect(headers.get('x-api-key')).toBe('sk-test')
    expect(headers.get('anthropic-beta')).toContain('server-side-fallback-2026-07-01')
  })

  it('Sonnet 5 (中): no fallbacks field; a refusal and a bad key are explained, not shown as answers', async () => {
    const refusal = recorder(anthropicReply('claude-sonnet-5', '', 'refusal'))
    await expect(
      askGuide({
        endpoint: endpoint('claude-sonnet-5'),
        attachment: null,
        history: [],
        question: 'q',
        fetchImpl: refusal.fetchImpl,
      }),
    ).rejects.toMatchObject({ kind: 'refusal' })
    expect(JSON.parse(String(refusal.calls[0]!.init.body)).fallbacks).toBeUndefined()
    const bad = recorder({ error: { message: 'bad key' } }, 401)
    const err = await askGuide({
      endpoint: endpoint('gpt-6-sol'),
      attachment: null,
      history: [],
      question: 'q',
      fetchImpl: bad.fetchImpl,
    }).catch((e) => e)
    expect(err).toBeInstanceOf(GuideError)
    expect(err.kind).toBe('auth')
  })
})
