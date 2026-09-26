import { describe, expect, it } from 'vitest'
import { askGuide, attachmentText, GuideError, openAiBody, type Attachment } from '../../../src/guide/ask'
import { defaultSettings, notReady, PROVIDERS } from '../../../src/guide/providers'

const IMG = 'data:image/png;base64,iVBORw0KGgo='
const attachment: Attachment = {
  image: IMG,
  place: 'φ と π の部屋 › 5 KAM',
  text: ['揺さぶりの強さ K：0.600'],
  state: { room: { page: 'φ と π の部屋' } },
}

function recorder(response: unknown, status = 200) {
  const calls: { url: string; init: RequestInit }[] = []
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} })
    return new Response(JSON.stringify(response), { status, headers: { 'content-type': 'application/json' } })
  }) as typeof fetch
  return { calls, fetchImpl }
}

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

  it('a text-only model gets no picture, and says so in the text', async () => {
    const s = { ...defaultSettings().providers.deepseek, apiKey: 'k' }
    const { calls, fetchImpl } = recorder({ choices: [{ message: { content: 'ok' } }] })
    const a = await askGuide({
      provider: 'deepseek',
      settings: s,
      attachment,
      history: [],
      question: 'q',
      fetchImpl,
    })
    expect(a).toMatchObject({ text: 'ok', sentImage: false, model: 'deepseek-chat' })
    expect(calls[0]!.url).toBe('https://api.deepseek.com/chat/completions')
    const body = JSON.parse(String(calls[0]!.init.body))
    expect(typeof body.messages.at(-1).content).toBe('string')
    expect(body.messages.at(-1).content).toContain('画像は送っていません')
  })

  it('follow-up questions resend the attachment text as the first turn, without the picture', async () => {
    const s = { ...defaultSettings().providers.qwen, apiKey: 'k', model: 'vl' }
    const { calls, fetchImpl } = recorder({ choices: [{ message: { content: 'ok' } }] })
    await askGuide({
      provider: 'qwen',
      settings: s,
      attachment,
      history: [
        { role: 'user', text: 'これは何？' },
        { role: 'assistant', text: 'KAM の図です' },
      ],
      question: 'もっと',
      fetchImpl,
    })
    const msgs = JSON.parse(String(calls[0]!.init.body)).messages
    expect(msgs[1].content).toContain('【画面の場所】φ と π の部屋 › 5 KAM')
    expect(msgs.at(-1).content).toBe('もっと')
  })

  it('Anthropic: the picture as a base64 image block, fallbacks for Opus 5', async () => {
    const s = { ...defaultSettings().providers.claude, apiKey: 'sk-test' }
    const { calls, fetchImpl } = recorder({
      id: 'msg_1',
      type: 'message',
      role: 'assistant',
      model: 'claude-opus-5',
      content: [{ type: 'text', text: '答え' }],
      stop_reason: 'end_turn',
      stop_sequence: null,
      usage: { input_tokens: 1, output_tokens: 1 },
    })
    const a = await askGuide({
      provider: 'claude',
      settings: s,
      attachment,
      history: [],
      question: 'q',
      fetchImpl,
    })
    expect(a).toMatchObject({ text: '答え', sentImage: true })
    expect(calls[0]!.url).toContain('https://api.anthropic.com/v1/messages')
    const body = JSON.parse(String(calls[0]!.init.body))
    expect(body.model).toBe('claude-opus-5')
    expect(body.fallbacks).toBe('default')
    expect(body.messages[0].content[0]).toEqual({
      type: 'image',
      source: { type: 'base64', media_type: 'image/png', data: 'iVBORw0KGgo=' },
    })
    const headers = new Headers(calls[0]!.init.headers)
    expect(headers.get('x-api-key')).toBe('sk-test')
    expect(headers.get('anthropic-beta')).toContain('server-side-fallback-2026-07-01')
  })

  it('a refusal and a bad key are explained, not shown as answers', async () => {
    const s = { ...defaultSettings().providers.claude, apiKey: 'sk-test', model: 'claude-sonnet-5' }
    const refusal = recorder({
      id: 'm',
      type: 'message',
      role: 'assistant',
      model: 'claude-sonnet-5',
      content: [],
      stop_reason: 'refusal',
      stop_sequence: null,
      usage: { input_tokens: 1, output_tokens: 0 },
    })
    await expect(
      askGuide({
        provider: 'claude',
        settings: s,
        attachment: null,
        history: [],
        question: 'q',
        fetchImpl: refusal.fetchImpl,
      }),
    ).rejects.toMatchObject({ kind: 'refusal' })
    // no fallbacks field for models other than Opus 5 / Fable 5
    expect(JSON.parse(String(refusal.calls[0]!.init.body)).fallbacks).toBeUndefined()
    const bad = recorder({ error: { message: 'bad key' } }, 401)
    const o = { ...defaultSettings().providers.openai, apiKey: 'k', model: 'm' }
    const err = await askGuide({
      provider: 'openai',
      settings: o,
      attachment: null,
      history: [],
      question: 'q',
      fetchImpl: bad.fetchImpl,
    }).catch((e) => e)
    expect(err).toBeInstanceOf(GuideError)
    expect(err.kind).toBe('auth')
  })

  it('says what is missing before asking', () => {
    const d = defaultSettings()
    expect(notReady(d.providers.claude, PROVIDERS.claude)).toContain('API キー')
    expect(notReady({ ...d.providers.openai, apiKey: 'k' }, PROVIDERS.openai)).toContain('モデル名')
    expect(notReady({ ...d.providers.deepseek, apiKey: 'k' }, PROVIDERS.deepseek)).toBeNull()
  })
})
