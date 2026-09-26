/**
 * AI Mathematical Observer (spec §38) via the DeepSeek API (OpenAI-compatible chat completions).
 *
 * - The API key is supplied by the user and kept only in this browser (localStorage); it is sent
 *   only to the configured endpoint, never included in exports, history or logs.
 * - The model receives computed facts and is instructed to separate restated facts from
 *   conjectures. Its answer is always shown as unverified conjecture, never as proof.
 */
export const DEEPSEEK_DEFAULT_BASE = 'https://api.deepseek.com'
export const DEEPSEEK_MODELS = ['deepseek-chat', 'deepseek-reasoner'] as const
export type DeepSeekModel = (typeof DEEPSEEK_MODELS)[number]

export interface ObserverRequest {
  experiment: string
  constant: string
  precision: number
  steps: number
  parameters: Record<string, number | boolean>
  formulas: string[]
  facts: unknown
}

export interface ObserverAnswer {
  text: string
  model: string
  createdAt: string
}

export const SYSTEM_PROMPT = [
  'You are a careful mathematical observer for "π Infinite Lab", an app that turns the digits or value of a',
  'mathematical constant into geometry with an explicit, deterministic rule.',
  'You receive the rule (formulas), the parameters and MEASURED FACTS computed by the app.',
  'Answer in Japanese, in two clearly separated sections:',
  '1. 観測（事実の言い換え）: only restate what the measured facts say; cite the numbers.',
  '2. 推測（未検証）: possible explanations or patterns worth testing, each labelled as a conjecture,',
  '   with a concrete way to check it in the app (e.g. which step range or parameter to try).',
  'Never claim that something is proven. Do not invent measurements that are not in the facts.',
  'If the facts are insufficient, say so.',
].join('\n')

export function buildMessages(req: ObserverRequest): { role: 'system' | 'user'; content: string }[] {
  return [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: `Experiment data (JSON):\n${JSON.stringify(req, null, 2)}` },
  ]
}

export class ObserverError extends Error {
  constructor(
    message: string,
    readonly kind: 'network' | 'auth' | 'rate' | 'server' | 'format',
  ) {
    super(message)
  }
}

export async function askObserver(
  req: ObserverRequest,
  options: {
    apiKey: string
    model?: DeepSeekModel
    baseUrl?: string
    fetchFn?: typeof fetch
    now?: () => Date
  },
): Promise<ObserverAnswer> {
  const { apiKey } = options
  if (!apiKey.trim()) throw new ObserverError('API key is empty', 'auth')
  const model = options.model ?? 'deepseek-chat'
  const base = (options.baseUrl ?? DEEPSEEK_DEFAULT_BASE).replace(/\/+$/, '')
  const fetchFn = options.fetchFn ?? fetch
  let res: Response
  try {
    res = await fetchFn(`${base}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey.trim()}` },
      body: JSON.stringify({ model, messages: buildMessages(req), temperature: 0.3, stream: false }),
    })
  } catch (err) {
    throw new ObserverError(
      `Could not reach ${base} (${err instanceof Error ? err.message : String(err)}). ` +
        'The network may block it, or the browser may refuse the request (CORS).',
      'network',
    )
  }
  if (res.status === 401 || res.status === 403)
    throw new ObserverError('The API key was rejected (401/403).', 'auth')
  if (res.status === 429) throw new ObserverError('Rate limited or out of balance (429).', 'rate')
  if (!res.ok) throw new ObserverError(`DeepSeek returned HTTP ${res.status}.`, 'server')
  let json: unknown
  try {
    json = await res.json()
  } catch {
    throw new ObserverError('The response was not JSON.', 'format')
  }
  const text = (json as { choices?: { message?: { content?: unknown } }[] }).choices?.[0]?.message?.content
  if (typeof text !== 'string' || !text.trim())
    throw new ObserverError('The response had no answer text.', 'format')
  return { text, model, createdAt: (options.now ?? (() => new Date()))().toISOString() }
}

// ---- key storage (this browser only) ---------------------------------------------------

const KEY_STORAGE = 'pi-infinite-lab.deepseek.key'

export function loadApiKey(): string {
  try {
    return window.localStorage.getItem(KEY_STORAGE) ?? ''
  } catch {
    return ''
  }
}

export function saveApiKey(key: string): void {
  try {
    if (key) window.localStorage.setItem(KEY_STORAGE, key)
    else window.localStorage.removeItem(KEY_STORAGE)
  } catch {
    // storage unavailable: the key lives only for this session
  }
}
