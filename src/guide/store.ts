import { create } from 'zustand'
import { askGuide, GuideError, type Attachment, type Turn } from './ask'
import { collectState } from './context'
import {
  loadSettings,
  notReady,
  PROVIDERS,
  saveSettings,
  type GuideSettings,
  type ProviderId,
  type Tier,
} from './providers'

export interface Message extends Turn {
  /** assistant: who answered */
  by?: { provider: ProviderId; model: string; tier: Tier; sentImage: boolean }
}

interface GuideState {
  /** the pen is out: the next stroke circles an area */
  drawing: boolean
  panel: boolean
  settingsOpen: boolean
  /** gathering the picture and text of a circled area */
  capturing: boolean
  attachment: Attachment | null
  messages: Message[]
  busy: Tier | null
  error: string | null
  settings: GuideSettings
}

export const useGuide = create<GuideState>(() => ({
  drawing: false,
  panel: false,
  settingsOpen: false,
  capturing: false,
  attachment: null,
  messages: [],
  busy: null,
  error: null,
  settings: loadSettings(),
}))

let abort: AbortController | null = null

export const guide = {
  startDrawing() {
    useGuide.setState({ drawing: true })
  },
  cancelDrawing() {
    useGuide.setState({ drawing: false })
  },
  /** A new circled area starts a new conversation about it. */
  attach(attachment: Attachment) {
    abort?.abort()
    useGuide.setState({ attachment, messages: [], error: null, busy: null, panel: true, drawing: false })
  },
  clearAttachment() {
    abort?.abort()
    useGuide.setState({ attachment: null, messages: [], error: null, busy: null })
  },
  open() {
    useGuide.setState({ panel: true })
  },
  close() {
    abort?.abort()
    useGuide.setState({ panel: false, busy: null, settingsOpen: false })
  },
  toggleSettings(open?: boolean) {
    useGuide.setState((s) => ({ settingsOpen: open ?? !s.settingsOpen }))
  },
  updateSettings(next: GuideSettings) {
    saveSettings(next)
    useGuide.setState({ settings: next })
  },

  /** Ask a question in the "ふつう" tier. */
  ask(question: string) {
    return run(question.trim(), 'normal', null)
  },

  /**
   * Ask the latest question again in the "じっくり" tier (e.g. Claude). The earlier answer stays
   * on screen; the deeper one is added below it, so the two can be compared.
   */
  deeper() {
    const s = useGuide.getState()
    const idx = s.messages.map((m) => m.role).lastIndexOf('user')
    if (idx < 0) return Promise.resolve()
    return run(s.messages[idx]!.text, 'deep', idx)
  },
}

/**
 * `reask`: index of an already shown question to answer again (its earlier turns are the
 * history); null: a new question, added to the conversation.
 */
async function run(q: string, tier: Tier, reask: number | null) {
  const s = useGuide.getState()
  if (!q || s.busy) return
  const provider = s.settings.tiers[tier]
  const settings = s.settings.providers[provider]
  const missing = notReady(settings, PROVIDERS[provider])
  if (missing) {
    useGuide.setState({ error: `${missing}。⚙ 設定から入力してください。`, settingsOpen: true })
    return
  }
  const shown = reask === null ? s.messages : s.messages.slice(0, reask)
  const history: Turn[] = shown.map(({ role, text }) => ({ role, text }))
  abort?.abort()
  const controller = new AbortController()
  abort = controller
  if (reask === null) useGuide.setState({ messages: [...s.messages, { role: 'user', text: q }] })
  useGuide.setState({ busy: tier, error: null })
  try {
    const a = await askGuide({
      provider,
      settings,
      // nothing circled: still tell the AI where the viewer is and what the page shows
      attachment: s.attachment ?? { image: null, place: '', text: [], state: collectState() },
      history,
      question: q,
      signal: controller.signal,
    })
    if (abort !== controller) return
    useGuide.setState((st) => ({
      messages: [
        ...st.messages,
        { role: 'assistant', text: a.text, by: { provider, model: a.model, tier, sentImage: a.sentImage } },
      ],
      busy: null,
    }))
  } catch (err) {
    if (abort !== controller) return
    if (err instanceof DOMException && err.name === 'AbortError') return
    useGuide.setState((st) => ({
      // a new question that got no answer is taken back out, so it can be asked again
      messages: reask === null ? st.messages.slice(0, -1) : st.messages,
      busy: null,
      error: err instanceof GuideError ? err.message : `うまく聞けませんでした：${String(err)}`,
    }))
  }
}
