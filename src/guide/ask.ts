import type Anthropic from '@anthropic-ai/sdk'
import { PROVIDERS, type Endpoint } from './providers'

/** What the viewer circled, gathered by the guide layer. */
export interface Attachment {
  /** PNG data URL of the circled area (with the pen stroke drawn on it), if it could be captured */
  image: string | null
  /** Where on the page: e.g. "φ と π の部屋 › 4 トーラスを埋める速さ" */
  place: string
  /** Text found inside the circle */
  text: string[]
  /** State the page reports (computed values, settings), as JSON-able data */
  state: Record<string, unknown>
}

export interface Turn {
  role: 'user' | 'assistant'
  text: string
}

export interface Answer {
  text: string
  /** catalog id (providers.ts MODELS) and the API model name that answered */
  modelId: string
  model: string
  /** the picture was sent (false: text only, e.g. the model cannot read images) */
  sentImage: boolean
  /** tokens the provider reported, for the cost shown with the answer */
  usage: { input: number; output: number } | null
}

interface Reply {
  text: string
  usage: Answer['usage']
}

export const GUIDE_SYSTEM_PROMPT = [
  'あなたは数学実験アプリ「π Infinite Lab」のガイドです。利用者は画面の気になる部分をペンで丸く囲み、そこについて質問しています。',
  '渡されるもの：囲んだ部分の画像（ある場合）、囲んだ範囲にある文字、画面がどこか、アプリが計算した画面の状態。',
  '答え方：',
  '- 日本語で、やさしく、短く。まず結論を 1〜2 文で言い、必要なら短く説明する。専門用語は言い換える。',
  '- アプリが表示・計算した値（渡された文字と状態）、一般的な数学の知識、あなたの推測をはっきり区別する。推測には「推測ですが」と書く。',
  '- 渡されていない数値を作らない。画像や文字から読み取れないことは、読み取れないと言う。',
  '- 役に立つときは、アプリの中で何を操作すれば確かめられるかを 1 つだけ提案する。',
  '- 見出しや箇条書きは最小限にする。数式は必要なときだけ短く書く。',
].join('\n')

/** The first user message about an attachment: the question plus everything the guide gathered. */
export function attachmentText(a: Attachment, question: string, withImage: boolean): string {
  const parts = [`【画面の場所】${a.place || '（不明）'}`]
  parts.push(
    withImage
      ? '【囲んだ部分】画像を添付しています（ペンの線は利用者が引いた囲みです）。'
      : '【囲んだ部分】画像は送っていません。下の文字と状態から判断してください。',
  )
  if (a.text.length) parts.push(`【囲んだ範囲にある文字】\n${a.text.join('\n')}`)
  if (Object.keys(a.state).length)
    parts.push(`【画面の状態（アプリの計算値）】\n${JSON.stringify(a.state, null, 1)}`)
  parts.push(`【質問】${question}`)
  return parts.join('\n\n')
}

export class GuideError extends Error {
  constructor(
    message: string,
    readonly kind: 'auth' | 'rate' | 'network' | 'server' | 'refusal' | 'format',
  ) {
    super(message)
  }
}

/**
 * Ask a provider. `history` holds the earlier turns of this conversation (text only); the
 * attachment (and its picture, if the model reads images) goes with the first question.
 */
export async function askGuide(o: {
  endpoint: Endpoint
  attachment: Attachment | null
  history: Turn[]
  question: string
  signal?: AbortSignal
  fetchImpl?: typeof fetch
}): Promise<Answer> {
  const e = o.endpoint
  const info = PROVIDERS[e.provider]
  const withImage = !!(o.attachment?.image && e.vision)
  const first = o.history.length === 0
  const userText = o.attachment && first ? attachmentText(o.attachment, o.question, withImage) : o.question
  // the attachment text is the first user turn; later turns refer back to it
  const earlier: Turn[] = o.history.map((t, i) =>
    i === 0 && o.attachment && t.role === 'user'
      ? { role: 'user', text: attachmentText(o.attachment, t.text, withImage) }
      : t,
  )
  const image = withImage && first ? o.attachment!.image! : null
  const reply =
    info.kind === 'anthropic'
      ? await askAnthropic(e, earlier, userText, image, o.signal, o.fetchImpl)
      : await askOpenAiCompatible(e, earlier, userText, image, o.signal, o.fetchImpl)
  return { ...reply, modelId: e.modelId, model: e.model, sentImage: withImage }
}

/** Anthropic Messages API from the browser (the viewer's own key; see providers.ts). */
async function askAnthropic(
  s: Endpoint,
  history: Turn[],
  question: string,
  image: string | null,
  signal?: AbortSignal,
  fetchImpl?: typeof fetch,
): Promise<Reply> {
  // the SDK loads when Claude is first asked (it is not needed for the other providers)
  const { default: Anthropic } = await import('@anthropic-ai/sdk')
  const client = new Anthropic({
    apiKey: s.apiKey.trim(),
    dangerouslyAllowBrowser: true, // the key is the viewer's own, typed into this page
    ...(s.baseUrl.trim() ? { baseURL: s.baseUrl.trim() } : {}),
    ...(fetchImpl ? { fetch: fetchImpl } : {}),
    maxRetries: 1,
  })
  const content: Anthropic.Beta.BetaContentBlockParam[] = []
  if (image) {
    const m = /^data:(image\/(?:png|jpeg|webp|gif));base64,(.*)$/.exec(image)
    if (m)
      content.push({
        type: 'image',
        source: { type: 'base64', media_type: m[1] as 'image/png', data: m[2]! },
      })
  }
  content.push({ type: 'text', text: question })
  const messages: Anthropic.Beta.BetaMessageParam[] = [
    ...history.map((t) => ({ role: t.role, content: t.text })),
    { role: 'user', content },
  ]
  // Opus 5 / Fable 5 may decline with stop_reason "refusal"; server-side fallbacks re-run the
  // request on a suitable model inside the same call (enabled by default for these models).
  const fallback = /^claude-(opus-5|fable-5)/.test(s.model.trim())
  try {
    const response = await client.beta.messages.create(
      {
        model: s.model.trim(),
        max_tokens: 16000,
        system: GUIDE_SYSTEM_PROMPT,
        messages,
        ...(fallback ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {}),
      },
      { signal },
    )
    if (response.stop_reason === 'refusal')
      throw new GuideError(
        'この質問には答えられないと判断されました。聞き方を変えてみてください。',
        'refusal',
      )
    const text = response.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim()
    if (!text) throw new GuideError('答えが空でした。', 'format')
    return { text, usage: { input: response.usage.input_tokens, output: response.usage.output_tokens } }
  } catch (err) {
    if (err instanceof GuideError) throw err
    if (err instanceof Anthropic.AuthenticationError)
      throw new GuideError('API キーが正しくないようです（401）。設定を確認してください。', 'auth')
    if (err instanceof Anthropic.RateLimitError)
      throw new GuideError('混み合っているか、利用上限に達しました（429）。少し待ってください。', 'rate')
    if (err instanceof Anthropic.APIConnectionError)
      throw new GuideError('Claude に接続できませんでした。ネットワークを確認してください。', 'network')
    if (err instanceof Anthropic.APIError)
      throw new GuideError(`Claude からエラーが返りました（${err.status ?? '?'}）：${err.message}`, 'server')
    throw err
  }
}

/** OpenAI-compatible chat completions (OpenAI, Qwen, MiniMax, DeepSeek, …). */
async function askOpenAiCompatible(
  s: Endpoint,
  history: Turn[],
  question: string,
  image: string | null,
  signal?: AbortSignal,
  fetchImpl: typeof fetch = fetch,
): Promise<Reply> {
  const body = openAiBody(s.model.trim(), history, question, image)
  let res: Response
  try {
    res = await fetchImpl(`${s.baseUrl.trim().replace(/\/+$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${s.apiKey.trim()}` },
      body: JSON.stringify(body),
      signal,
    })
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err
    throw new GuideError(
      'サーバーに届きませんでした。ブラウザから直接つながらない（CORS）場合は、設定の接続先 URL を中継サーバーに変えてください。',
      'network',
    )
  }
  if (res.status === 401 || res.status === 403)
    throw new GuideError(`API キーが正しくないようです（${res.status}）。設定を確認してください。`, 'auth')
  if (res.status === 429) throw new GuideError('混み合っているか、利用上限に達しました（429）。', 'rate')
  if (!res.ok) {
    const detail = (await res.text().catch(() => '')).slice(0, 300)
    throw new GuideError(`エラーが返りました（${res.status}）：${detail}`, 'server')
  }
  const data = (await res.json().catch(() => null)) as {
    choices?: { message?: { content?: string | { type: string; text?: string }[] } }[]
    usage?: { prompt_tokens?: number; completion_tokens?: number }
  } | null
  const c = data?.choices?.[0]?.message?.content
  const text = (
    typeof c === 'string' ? c : Array.isArray(c) ? c.map((p) => p.text ?? '').join('') : ''
  ).trim()
  if (!text) throw new GuideError('答えの形式が読み取れませんでした。', 'format')
  const u = data?.usage
  const usage =
    typeof u?.prompt_tokens === 'number' && typeof u?.completion_tokens === 'number'
      ? { input: u.prompt_tokens, output: u.completion_tokens }
      : null
  return { text, usage }
}

export function openAiBody(model: string, history: Turn[], question: string, image: string | null) {
  const user = image
    ? [
        { type: 'text', text: question },
        { type: 'image_url', image_url: { url: image } },
      ]
    : question
  return {
    model,
    messages: [
      { role: 'system', content: GUIDE_SYSTEM_PROMPT },
      ...history.map((t) => ({ role: t.role, content: t.text })),
      { role: 'user', content: user },
    ],
  }
}
