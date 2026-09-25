import { describe, expect, it } from 'vitest'
import {
  askObserver,
  buildMessages,
  ObserverError,
  SYSTEM_PROMPT,
  type ObserverRequest,
} from '../../../src/ai/deepseek'

const req: ObserverRequest = {
  experiment: 'two-arm',
  constant: 'pi',
  precision: 1000,
  steps: 500,
  parameters: { dt: 0.05 },
  formulas: ['θ₁ = (n × dt) mod 2π'],
  facts: { symmetry: [{ order: 15, strength: 0.4 }] },
}

function fakeFetch(
  status: number,
  body: unknown,
  capture?: { url?: string; init?: RequestInit },
): typeof fetch {
  return (async (url: string, init: RequestInit) => {
    if (capture) {
      capture.url = url
      capture.init = init
    }
    return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status })
  }) as unknown as typeof fetch
}

describe('AI Observer (DeepSeek)', () => {
  it('sends facts with the conjecture-vs-fact instructions and returns the answer', async () => {
    const cap: { url?: string; init?: RequestInit } = {}
    const ans = await askObserver(req, {
      apiKey: ' sk-test ',
      fetchFn: fakeFetch(200, { choices: [{ message: { content: '観測: …\n推測（未検証）: …' } }] }, cap),
      now: () => new Date('2026-09-26T00:00:00Z'),
    })
    expect(cap.url).toBe('https://api.deepseek.com/chat/completions')
    const headers = cap.init!.headers as Record<string, string>
    expect(headers.Authorization).toBe('Bearer sk-test')
    const body = JSON.parse(cap.init!.body as string)
    expect(body.model).toBe('deepseek-chat')
    expect(body.messages[0].content).toBe(SYSTEM_PROMPT)
    expect(body.messages[1].content).toContain('"order": 15')
    expect(ans).toEqual({
      text: '観測: …\n推測（未検証）: …',
      model: 'deepseek-chat',
      createdAt: '2026-09-26T00:00:00.000Z',
    })
  })

  it('never puts the key into the message content', () => {
    const msgs = buildMessages(req)
    expect(JSON.stringify(msgs)).not.toContain('sk-')
  })

  it.each([
    [401, {}, 'auth'],
    [429, {}, 'rate'],
    [500, {}, 'server'],
    [200, 'not json', 'format'],
    [200, { choices: [] }, 'format'],
  ] as const)('HTTP %i → %s error', async (status, body, kind) => {
    await expect(askObserver(req, { apiKey: 'k', fetchFn: fakeFetch(status, body) })).rejects.toMatchObject({
      kind,
    })
  })

  it('reports network / CORS failures and empty keys', async () => {
    const failing = (async () => {
      throw new TypeError('Failed to fetch')
    }) as unknown as typeof fetch
    await expect(askObserver(req, { apiKey: 'k', fetchFn: failing })).rejects.toMatchObject({
      kind: 'network',
    })
    await expect(askObserver(req, { apiKey: '  ' })).rejects.toBeInstanceOf(ObserverError)
  })
})
