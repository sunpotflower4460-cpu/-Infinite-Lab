import { create } from 'zustand'
import { askGuide, GuideError, type Attachment, type Turn } from './ask'
import { collectState } from './context'
import {
  costOf,
  endpointFor,
  loadSettings,
  modelInfo,
  notReady,
  saveSettings,
  type GuideSettings,
  type ModelClass,
} from './providers'

export interface Message extends Turn {
  /** assistant: who answered, and what it cost (US$, list price; null if not reported) */
  by?: { modelId: string; model: string; cls: ModelClass; sentImage: boolean; usd: number | null }
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
  /** the class answering right now */
  busy: ModelClass | null
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
  /** Pick the model a class uses (the panel's quick switch for 下). */
  choose(cls: ModelClass, modelId: string) {
    const s = useGuide.getState().settings
    if (modelInfo(modelId).class !== cls) return
    guide.updateSettings({ ...s, choice: { ...s.choice, [cls]: modelId } })
  },

  /** A new question: answered in 下 (light) first. */
  ask(question: string) {
    return run(question.trim(), 'light', null)
  },

  /**
   * Ask the latest question again one class up (中 or 上). The earlier answers stay on screen;
   * the new one is added below them, so they can be compared.
   */
  askAgain(cls: ModelClass) {
    const s = useGuide.getState()
    const idx = s.messages.map((m) => m.role).lastIndexOf('user')
    if (idx < 0) return Promise.resolve()
    return run(s.messages[idx]!.text, cls, idx)
  },
}

/**
 * `reask`: index of an already shown question to answer again (its earlier turns are the
 * history); null: a new question, added to the conversation.
 */
async function run(q: string, cls: ModelClass, reask: number | null) {
  const s = useGuide.getState()
  if (!q || s.busy) return
  const endpoint = endpointFor(s.settings, s.settings.choice[cls])
  const missing = notReady(endpoint)
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
  useGuide.setState({ busy: cls, error: null })
  try {
    const a = await askGuide({
      endpoint,
      // nothing circled: still tell the AI where the viewer is and what the page shows
      attachment: s.attachment ?? { image: null, place: '', text: [], state: collectState() },
      history,
      question: q,
      signal: controller.signal,
    })
    if (abort !== controller) return
    const by = {
      modelId: a.modelId,
      model: a.model,
      cls,
      sentImage: a.sentImage,
      usd: costOf(a.modelId, a.usage),
    }
    useGuide.setState((st) => ({
      messages: [...st.messages, { role: 'assistant', text: a.text, by }],
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
