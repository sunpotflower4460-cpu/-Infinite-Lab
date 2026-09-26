/**
 * AI Guide: companies (one API key each) and models grouped into three classes.
 *
 *   下 light    ~0.1 yen a question — answers first; several models to choose from
 *   中 standard ~1–2 yen             — asked again when the light answer is not enough
 *   上 deep     ~3 yen                — the strongest, when even that is not enough
 *
 * Keys and settings are the viewer's own and stay in this browser (localStorage); they are sent
 * only to that company's endpoint, never exported or logged. Prices and scores are as checked
 * in September 2026 (see MODELS); model names change, so each can be edited.
 */

export type ProviderId = 'openai' | 'qwen' | 'minimax' | 'deepseek' | 'claude'
export type ModelClass = 'light' | 'standard' | 'deep'

export const CLASS_ORDER: ModelClass[] = ['light', 'standard', 'deep']
export const CLASS_LABEL: Record<ModelClass, string> = { light: '下', standard: '中', deep: '上' }
export const CLASS_NOTE: Record<ModelClass, string> = {
  light: '1 回 0.1 円前後。まずここで答えます',
  standard: '1 回 1〜2 円。下で足りないときに聞き直す',
  deep: '1 回 3 円前後。いちばん強いモデル',
}

export interface ProviderInfo {
  id: ProviderId
  label: string
  kind: 'openai-compatible' | 'anthropic'
  baseUrl: string
}

export const PROVIDERS: Record<ProviderId, ProviderInfo> = {
  openai: { id: 'openai', label: 'OpenAI', kind: 'openai-compatible', baseUrl: 'https://api.openai.com/v1' },
  claude: { id: 'claude', label: 'Anthropic（Claude）', kind: 'anthropic', baseUrl: '' },
  qwen: {
    id: 'qwen',
    label: 'Alibaba Cloud（Qwen）',
    kind: 'openai-compatible',
    baseUrl: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
  },
  deepseek: {
    id: 'deepseek',
    label: 'DeepSeek',
    kind: 'openai-compatible',
    baseUrl: 'https://api.deepseek.com',
  },
  minimax: {
    id: 'minimax',
    label: 'MiniMax',
    kind: 'openai-compatible',
    baseUrl: 'https://api.minimax.io/v1',
  },
}

export const PROVIDER_ORDER: ProviderId[] = ['openai', 'claude', 'qwen', 'deepseek', 'minimax']

export interface ModelInfo {
  id: string
  label: string
  provider: ProviderId
  class: ModelClass
  /** default API model name (editable in the settings) */
  model: string
  /** US$ per 1M tokens, input / output (list price, 2026-09) */
  price: [number, number]
  /** Artificial Analysis Intelligence Index v4.3.2 (2026-09), null = not listed */
  score: number | null
  note?: string
}

export const MODELS: ModelInfo[] = [
  {
    id: 'gpt-6-luna',
    label: 'GPT-6 Luna',
    provider: 'openai',
    class: 'light',
    model: 'gpt-6-luna',
    price: [0.1, 0.5],
    score: 37,
  },
  {
    id: 'deepseek-flash',
    label: 'DeepSeek V4.1 Flash',
    provider: 'deepseek',
    class: 'light',
    model: 'deepseek-flash',
    price: [0.15, 0.6],
    score: 39,
    note: '混む時間帯（UTC 平日 1–4 時・6–10 時）は 2 倍',
  },
  {
    id: 'qwen-flash',
    label: 'Qwen 3.8 Flash',
    provider: 'qwen',
    class: 'light',
    model: 'qwen3.8-flash',
    price: [0.16, 0.47],
    score: null,
  },
  {
    id: 'minimax-m3',
    label: 'MiniMax M3',
    provider: 'minimax',
    class: 'light',
    model: 'MiniMax-M3',
    price: [0.3, 1.2],
    score: 29,
  },
  {
    id: 'gpt-6-sol',
    label: 'GPT-6 Sol',
    provider: 'openai',
    class: 'standard',
    model: 'gpt-6-sol',
    price: [2, 10],
    score: 48,
  },
  {
    id: 'qwen-max',
    label: 'Qwen 3.8 Max',
    provider: 'qwen',
    class: 'standard',
    model: 'qwen3.8-max',
    price: [2, 6],
    score: 45,
  },
  {
    id: 'claude-sonnet-5',
    label: 'Claude Sonnet 5',
    provider: 'claude',
    class: 'standard',
    model: 'claude-sonnet-5',
    price: [2, 10],
    score: 38,
  },
  {
    id: 'claude-opus-5-5',
    label: 'Claude Opus 5.5',
    provider: 'claude',
    class: 'deep',
    model: 'claude-opus-5-5',
    price: [4, 20],
    score: 58,
  },
]

export const modelInfo = (id: string): ModelInfo => MODELS.find((m) => m.id === id) ?? MODELS[0]!

export interface ProviderSettings {
  apiKey: string
  baseUrl: string
}

export interface ModelSettings {
  /** API model name actually sent */
  model: string
  /** the model reads images (the circled area is sent as a picture) */
  vision: boolean
}

export interface GuideSettings {
  providers: Record<ProviderId, ProviderSettings>
  models: Record<string, ModelSettings>
  /** the model each class uses */
  choice: Record<ModelClass, string>
}

/** Everything needed to send one request. */
export interface Endpoint {
  modelId: string
  provider: ProviderId
  apiKey: string
  baseUrl: string
  model: string
  vision: boolean
}

const STORAGE = 'pi-infinite-lab.guide.settings.v2'
const OLD_STORAGE = 'pi-infinite-lab.guide.settings'
/** The lab's AI Observer already keeps a DeepSeek key; the guide reuses it if present. */
const DEEPSEEK_OBSERVER_KEY = 'pi-infinite-lab.deepseek.key'

export function defaultSettings(): GuideSettings {
  return {
    providers: Object.fromEntries(
      PROVIDER_ORDER.map((id) => [id, { apiKey: '', baseUrl: PROVIDERS[id].baseUrl }]),
    ) as Record<ProviderId, ProviderSettings>,
    models: Object.fromEntries(MODELS.map((m) => [m.id, { model: m.model, vision: true }])),
    choice: { light: 'gpt-6-luna', standard: 'gpt-6-sol', deep: 'claude-opus-5-5' },
  }
}

export function loadSettings(): GuideSettings {
  const base = defaultSettings()
  try {
    const store = globalThis.localStorage
    const raw = store?.getItem(STORAGE)
    if (raw) {
      const saved = JSON.parse(raw) as Partial<GuideSettings>
      for (const id of PROVIDER_ORDER) {
        const p = saved.providers?.[id]
        if (typeof p?.apiKey === 'string') base.providers[id].apiKey = p.apiKey
        if (typeof p?.baseUrl === 'string') base.providers[id].baseUrl = p.baseUrl
      }
      for (const m of MODELS) {
        const s = saved.models?.[m.id]
        if (typeof s?.model === 'string') base.models[m.id]!.model = s.model
        if (typeof s?.vision === 'boolean') base.models[m.id]!.vision = s.vision
      }
      for (const c of CLASS_ORDER) {
        const id = saved.choice?.[c]
        if (id && MODELS.some((m) => m.id === id && m.class === c)) base.choice[c] = id
      }
    } else {
      // keys typed into the first version of the guide carry over
      const old = JSON.parse(store?.getItem(OLD_STORAGE) ?? 'null') as {
        providers?: Record<string, { apiKey?: string }>
      } | null
      for (const id of PROVIDER_ORDER) {
        const k = old?.providers?.[id]?.apiKey
        if (typeof k === 'string') base.providers[id].apiKey = k
      }
    }
    if (!base.providers.deepseek.apiKey)
      base.providers.deepseek.apiKey = store?.getItem(DEEPSEEK_OBSERVER_KEY) ?? ''
  } catch {
    // storage unavailable: defaults for this visit
  }
  return base
}

export function saveSettings(s: GuideSettings): void {
  try {
    globalThis.localStorage?.setItem(STORAGE, JSON.stringify(s))
  } catch {
    // storage unavailable (private mode): the settings last for this visit only
  }
}

export function endpointFor(s: GuideSettings, modelId: string): Endpoint {
  const info = modelInfo(modelId)
  const p = s.providers[info.provider]
  const m = s.models[modelId] ?? { model: info.model, vision: true }
  return {
    modelId,
    provider: info.provider,
    apiKey: p.apiKey,
    baseUrl: p.baseUrl,
    model: m.model,
    vision: m.vision,
  }
}

/** Why a model cannot be used yet (null = ready). */
export function notReady(e: Endpoint): string | null {
  const info = PROVIDERS[e.provider]
  if (!e.apiKey.trim()) return `${info.label} の API キーが未設定です`
  if (!e.model.trim()) return `${modelInfo(e.modelId).label} のモデル名が未設定です`
  if (info.kind === 'openai-compatible' && !/^https?:\/\//.test(e.baseUrl.trim()))
    return `${info.label} の接続先 URL が正しくありません`
  return null
}

/** Cost of one answer in US$ from the tokens the provider reported (list price). */
export function costOf(modelId: string, usage: { input: number; output: number } | null): number | null {
  if (!usage) return null
  const [pi, po] = modelInfo(modelId).price
  return (usage.input * pi + usage.output * po) / 1e6
}

/** Yen at a fixed 150 yen per dollar (the settings say so). */
export const YEN_PER_USD = 150
export function yen(usd: number): string {
  const y = usd * YEN_PER_USD
  return y < 0.01 ? '0.01 円未満' : `約 ${y < 1 ? y.toFixed(2) : y.toFixed(1)} 円`
}

/** A rough per-question cost for the settings list: 3,000 input and 500 output tokens. */
export function typicalYen(modelId: string): string {
  return yen(costOf(modelId, { input: 3000, output: 500 })!)
}
