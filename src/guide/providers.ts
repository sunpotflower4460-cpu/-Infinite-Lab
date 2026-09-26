/**
 * AI Guide providers. Keys and settings are the viewer's own and stay in this browser
 * (localStorage); they are sent only to the provider's endpoint, never exported or logged.
 *
 * Two tiers: "ふつう" (everyday questions, a cheaper model) and "じっくり" (only when the viewer
 * asks for a deeper answer, e.g. Claude). Every provider except Claude speaks the
 * OpenAI-compatible chat-completions format.
 */

export type ProviderId = 'openai' | 'qwen' | 'minimax' | 'deepseek' | 'claude'
export type Tier = 'normal' | 'deep'

export interface ProviderSettings {
  apiKey: string
  model: string
  baseUrl: string
  /** The model accepts images (the circled area is sent as a picture); otherwise text only. */
  vision: boolean
}

export interface ProviderInfo {
  id: ProviderId
  label: string
  kind: 'openai-compatible' | 'anthropic'
  defaults: ProviderSettings
  /** Shown next to the model field; names change often, so they are only examples. */
  modelHint: string
}

export const PROVIDERS: Record<ProviderId, ProviderInfo> = {
  openai: {
    id: 'openai',
    label: 'OpenAI（GPT）',
    kind: 'openai-compatible',
    defaults: { apiKey: '', model: 'gpt-6-luna', baseUrl: 'https://api.openai.com/v1', vision: true },
    modelHint:
      'GPT-6 は安い順に gpt-6-luna（入力 $0.10 / 出力 $0.50 / 100 万トークン）、gpt-6-sol（$2 / $10）、gpt-6-astra（$10 / $50）。どれも画像を読めます（2026-09 時点）',
  },
  qwen: {
    id: 'qwen',
    label: 'Qwen（Alibaba Cloud）',
    kind: 'openai-compatible',
    defaults: {
      apiKey: '',
      model: '',
      baseUrl: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
      vision: true,
    },
    modelHint: '画像を送るなら VL（画像対応）のモデル名を入力',
  },
  minimax: {
    id: 'minimax',
    label: 'MiniMax',
    kind: 'openai-compatible',
    defaults: { apiKey: '', model: 'MiniMax-M3', baseUrl: 'https://api.minimax.io/v1', vision: true },
    modelHint:
      'MiniMax-M3 は画像も読めます。M2 系（MiniMax-M2.7 など）は文字だけなので「画像を送る」をオフに（2026-09 時点）',
  },
  deepseek: {
    id: 'deepseek',
    label: 'DeepSeek',
    kind: 'openai-compatible',
    defaults: { apiKey: '', model: 'deepseek-flash', baseUrl: 'https://api.deepseek.com', vision: true },
    modelHint:
      'deepseek-flash が最新の V4.1 Flash で、画像も読めます。古い deepseek-chat などを使うときは「画像を送る」をオフに（2026-09 時点）',
  },
  claude: {
    id: 'claude',
    label: 'Claude（Anthropic）',
    kind: 'anthropic',
    defaults: { apiKey: '', model: 'claude-opus-5', baseUrl: '', vision: true },
    modelHint: '既定は claude-opus-5。費用を抑えるなら claude-sonnet-5 など',
  },
}

export const PROVIDER_ORDER: ProviderId[] = ['openai', 'qwen', 'minimax', 'deepseek', 'claude']

export interface GuideSettings {
  providers: Record<ProviderId, ProviderSettings>
  tiers: Record<Tier, ProviderId>
}

const STORAGE = 'pi-infinite-lab.guide.settings'
/** The lab's AI Observer already keeps a DeepSeek key; the guide reuses it if present. */
const DEEPSEEK_OBSERVER_KEY = 'pi-infinite-lab.deepseek.key'

export function defaultSettings(): GuideSettings {
  const providers = Object.fromEntries(
    PROVIDER_ORDER.map((id) => [id, { ...PROVIDERS[id].defaults }]),
  ) as Record<ProviderId, ProviderSettings>
  return { providers, tiers: { normal: 'deepseek', deep: 'claude' } }
}

export function loadSettings(): GuideSettings {
  const base = defaultSettings()
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE)
    if (raw) {
      const saved = JSON.parse(raw) as Partial<GuideSettings>
      for (const id of PROVIDER_ORDER) {
        const p = saved.providers?.[id]
        if (p) base.providers[id] = { ...base.providers[id], ...pick(p) }
      }
      for (const t of ['normal', 'deep'] as const) {
        const id = saved.tiers?.[t]
        if (id && id in PROVIDERS) base.tiers[t] = id
      }
    }
    if (!base.providers.deepseek.apiKey)
      base.providers.deepseek.apiKey = globalThis.localStorage?.getItem(DEEPSEEK_OBSERVER_KEY) ?? ''
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

function pick(p: Partial<ProviderSettings>): Partial<ProviderSettings> {
  const out: Partial<ProviderSettings> = {}
  if (typeof p.apiKey === 'string') out.apiKey = p.apiKey
  if (typeof p.model === 'string') out.model = p.model
  if (typeof p.baseUrl === 'string') out.baseUrl = p.baseUrl
  if (typeof p.vision === 'boolean') out.vision = p.vision
  return out
}

/** Why a provider cannot be used yet (null = ready). */
export function notReady(s: ProviderSettings, info: ProviderInfo): string | null {
  if (!s.apiKey.trim()) return `${info.label} の API キーが未設定です`
  if (!s.model.trim()) return `${info.label} のモデル名が未設定です`
  if (info.kind === 'openai-compatible' && !/^https?:\/\//.test(s.baseUrl.trim()))
    return `${info.label} の接続先 URL が正しくありません`
  return null
}
