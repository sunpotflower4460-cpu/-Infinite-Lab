import { useEffect, useRef, useState, type ReactNode } from 'react'
import { collectState, placeOf, textInRect, type Rect } from '../../guide/context'
import {
  CLASS_LABEL,
  MODELS,
  modelInfo,
  notReady,
  endpointFor,
  typicalYen,
  yen,
  type ModelClass,
} from '../../guide/providers'
import { guide, useGuide } from '../../guide/store'
import { GuideSettingsView } from './GuideSettings'

/**
 * The AI Guide, on every screen: a pen to circle anything that raises a question, and a panel
 * that sends the circled area (picture, text, and the page's own state) along with it.
 */
export function GuideLayer() {
  const drawing = useGuide((s) => s.drawing)
  const panel = useGuide((s) => s.panel)
  return (
    <div data-guide-ignore>
      {!drawing && (
        <div className="guide-fab">
          <button
            className="guide-pen"
            onClick={guide.startDrawing}
            title="気になるところをペンで丸く囲んで、AI ガイドに聞く"
            aria-label="✎ 囲んで聞く"
          >
            ✎<span className="guide-fab-long"> 囲んで聞く</span>
          </button>
          {!panel && (
            <button onClick={guide.open} title="AI ガイドを開く" aria-label="AI ガイドを開く">
              AI<span className="guide-fab-long"> ガイド</span>
            </button>
          )}
        </div>
      )}
      {drawing && <PenOverlay />}
      {panel && <GuidePanel />}
    </div>
  )
}

// ---- pen ------------------------------------------------------------------------------------

function PenOverlay() {
  const canvas = useRef<HTMLCanvasElement>(null)
  const points = useRef<{ x: number; y: number }[]>([])
  const [hint, setHint] = useState('気になるところを、ペンで丸く囲んでください')

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        guide.cancelDrawing()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])

  const draw = () => {
    const c = canvas.current
    const ctx = c?.getContext('2d')
    if (!c || !ctx) return
    const dpr = window.devicePixelRatio || 1
    if (c.width !== c.clientWidth * dpr) {
      c.width = c.clientWidth * dpr
      c.height = c.clientHeight * dpr
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, c.clientWidth, c.clientHeight)
    const pts = points.current
    if (pts.length < 2) return
    ctx.strokeStyle = '#ffc766'
    ctx.lineWidth = 3
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(pts[0]!.x, pts[0]!.y)
    for (const p of pts.slice(1)) ctx.lineTo(p.x, p.y)
    ctx.stroke()
  }

  const finish = async () => {
    const pts = points.current
    const xs = pts.map((p) => p.x)
    const ys = pts.map((p) => p.y)
    const pad = 12
    const rect: Rect = {
      left: Math.max(0, Math.min(...xs) - pad),
      top: Math.max(0, Math.min(...ys) - pad),
      right: Math.min(window.innerWidth, Math.max(...xs) + pad),
      bottom: Math.min(window.innerHeight, Math.max(...ys) + pad),
    }
    if (pts.length < 3 || rect.right - rect.left < 24 || rect.bottom - rect.top < 24) {
      points.current = []
      draw()
      setHint('もう少し大きく囲んでください（Esc でやめる）')
      return
    }
    useGuide.setState({ capturing: true })
    // read the page under the overlay (the overlay itself is data-guide-ignore)
    const text = textInRect(rect)
    const { place, topic } = placeOf(rect)
    const state = { ...collectState(), ...(Object.keys(topic).length ? { topic } : {}) }
    // the capture code (html-to-image) loads on the first circle only
    const image = await import('../../guide/capture').then((m) => m.captureRect(rect, pts)).catch(() => null)
    useGuide.setState({ capturing: false })
    guide.attach({ image, place, text, state })
  }

  return (
    <div className="guide-pen-overlay" data-guide-ignore data-testid="guide-pen">
      <canvas
        ref={canvas}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId)
          points.current = [{ x: e.clientX, y: e.clientY }]
          draw()
        }}
        onPointerMove={(e) => {
          if (!e.buttons && e.pointerType === 'mouse') return
          if (!points.current.length) return
          points.current.push({ x: e.clientX, y: e.clientY })
          draw()
        }}
        onPointerUp={() => void finish()}
        aria-label="ペンで囲む"
      />
      <div className="guide-pen-hint">
        {hint}
        <button onClick={guide.cancelDrawing}>やめる</button>
      </div>
    </div>
  )
}

// ---- panel ----------------------------------------------------------------------------------

const QUICK = ['これは何？', 'もっとやさしく教えて', 'なぜこうなるの？', 'どこを動かせば確かめられる？']

function GuidePanel() {
  const { attachment, messages, busy, error, settings, settingsOpen, capturing } = useGuide()
  const [draft, setDraft] = useState('')
  const end = useRef<HTMLDivElement>(null)
  const light = settings.choice.light
  const lastAnswer = messages.at(-1)?.role === 'assistant' ? messages.at(-1) : undefined
  // classes above every class that has already answered the latest question
  const answered = new Set<ModelClass>()
  for (let i = messages.length - 1; i >= 0 && messages[i]!.role === 'assistant'; i--)
    answered.add(messages[i]!.by!.cls)
  const order: ModelClass[] = ['light', 'standard', 'deep']
  const top = Math.max(...[...answered].map((c) => order.indexOf(c)))
  const higher = lastAnswer ? order.filter((_, i) => i > top) : []

  useEffect(() => {
    // braces: newer browsers return a promise from scrollIntoView, which React must not see
    end.current?.scrollIntoView({ block: 'end' })
  }, [messages.length, busy])

  const send = (q: string) => {
    if (!q.trim()) return
    setDraft('')
    void guide.ask(q)
  }

  return (
    <aside className="guide-panel" data-guide-ignore data-testid="guide-panel" aria-label="AI ガイド">
      <header className="guide-head">
        <b>AI ガイド</b>
        <span className="guide-head-tools">
          <button
            onClick={() => guide.toggleSettings()}
            className={settingsOpen ? 'active' : ''}
            aria-label="AI ガイドの設定"
            title="使う AI と API キーの設定"
          >
            ⚙
          </button>
          <button onClick={guide.close} aria-label="AI ガイドを閉じる">
            ✕
          </button>
        </span>
      </header>

      {settingsOpen && error && (
        <p className="guide-error guide-error-top" role="alert">
          {error}
        </p>
      )}
      {settingsOpen ? (
        <GuideSettingsView />
      ) : (
        <div className="guide-body">
          {capturing && <p className="guide-note">囲んだところを読み取っています…</p>}
          {attachment ? (
            <div className="guide-attach" data-testid="guide-attachment">
              {attachment.image ? (
                <img src={attachment.image} alt="囲んだ部分" />
              ) : (
                <div className="guide-noimage">画像は取り込めませんでした（文字と状態を送ります）</div>
              )}
              <div className="guide-attach-meta">
                <div className="guide-place">{attachment.place || 'この画面'}</div>
                <details>
                  <summary>AI に渡す内容を見る</summary>
                  <p className="guide-small">
                    画像（{modelInfo(light).label}）：
                    {settings.models[light]?.vision ? '送る' : '送らない（文字だけ）'}
                  </p>
                  {attachment.text.length > 0 && (
                    <pre className="guide-pre">{attachment.text.join('\n')}</pre>
                  )}
                  <pre className="guide-pre">{JSON.stringify(attachment.state, null, 1)}</pre>
                </details>
                <div className="guide-attach-actions">
                  <button onClick={guide.startDrawing}>✎ 囲み直す</button>
                  <button onClick={guide.clearAttachment}>外す</button>
                </div>
              </div>
            </div>
          ) : (
            !capturing && (
              <div className="guide-empty">
                <p>
                  <b>✎ 囲んで聞く</b>
                  を押して、気になるところをペンで丸く囲むと、その部分について質問できます。
                </p>
                <p className="guide-small">囲まずに、いまの画面について質問することもできます。</p>
                <button onClick={guide.startDrawing}>✎ 囲んで聞く</button>
              </div>
            )
          )}

          <div className="guide-messages">
            {messages.map((m, i) => (
              <div key={i} className={`guide-msg guide-${m.role}`}>
                {m.role === 'assistant' ? <Rich text={m.text} /> : m.text}
                {m.by && (
                  <div className="guide-by">
                    {CLASS_LABEL[m.by.cls]}・{modelInfo(m.by.modelId).label}
                    {m.by.usd !== null ? `・${yen(m.by.usd)}` : ''}
                    {attachment?.image && !m.by.sentImage ? '・画像なし' : ''}
                  </div>
                )}
              </div>
            ))}
            {busy && (
              <div className="guide-msg guide-assistant guide-thinking" data-testid="guide-busy">
                {CLASS_LABEL[busy]}（{modelInfo(settings.choice[busy]).label}）が考えています…
              </div>
            )}
            {!busy && higher.length > 0 && (
              <div className="guide-again">
                <span className="guide-small">足りないときは：</span>
                {higher.map((c) => (
                  <button key={c} className={`guide-again-${c}`} onClick={() => void guide.askAgain(c)}>
                    {CLASS_LABEL[c]}で聞き直す（{modelInfo(settings.choice[c]).label}・
                    {typicalYen(settings.choice[c])}）
                  </button>
                ))}
              </div>
            )}
            <div ref={end} />
          </div>

          {error && (
            <p className="guide-error" role="alert">
              {error}
            </p>
          )}

          <div className="guide-light">
            <label className="guide-small">
              まず答える AI（下）
              <select
                value={light}
                onChange={(e) => guide.choose('light', e.target.value)}
                aria-label="まず答える AI"
              >
                {MODELS.filter((m) => m.class === 'light').map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}（{typicalYen(m.id)}）{notReady(endpointFor(settings, m.id)) ? '・キーなし' : ''}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="guide-quick">
            {QUICK.map((q) => (
              <button key={q} onClick={() => send(q)} disabled={!!busy}>
                {q}
              </button>
            ))}
          </div>
          <form
            className="guide-input"
            onSubmit={(e) => {
              e.preventDefault()
              send(draft)
            }}
          >
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault()
                  send(draft)
                }
              }}
              placeholder="質問を書く（Enter で送る、Shift + Enter で改行）"
              rows={2}
              aria-label="質問"
            />
            <button type="submit" disabled={!draft.trim() || !!busy}>
              送る
            </button>
          </form>
          <p className="guide-small guide-foot">
            料金は各社の定価と、AI が報告したトークン数からの目安です（1 ドル 150 円で換算）。AI
            の答えは推測を含みます。アプリの計算値と見比べてください。
          </p>
        </div>
      )}
    </aside>
  )
}

/** A small, safe renderer for the answers: paragraphs, lists, **bold** and `code` (no HTML). */
function Rich({ text }: { text: string }) {
  const blocks = text.replace(/\r/g, '').split(/\n{2,}/)
  return (
    <>
      {blocks.map((b, i) => {
        const lines = b.split('\n')
        if (lines.every((l) => /^\s*([-*・]|\d+[.)])\s+/.test(l)))
          return (
            <ul key={i}>
              {lines.map((l, j) => (
                <li key={j}>{inline(l.replace(/^\s*([-*・]|\d+[.)])\s+/, ''))}</li>
              ))}
            </ul>
          )
        return (
          <p key={i}>
            {lines.map((l, j) => (
              <span key={j}>
                {j > 0 && <br />}
                {inline(l.replace(/^#+\s*/, ''))}
              </span>
            ))}
          </p>
        )
      })}
    </>
  )
}

function inline(s: string): ReactNode[] {
  return s
    .split(/(\*\*[^*]+\*\*|`[^`]+`)/g)
    .map((part, i) =>
      part.startsWith('**') && part.endsWith('**') ? (
        <b key={i}>{part.slice(2, -2)}</b>
      ) : part.startsWith('`') && part.endsWith('`') ? (
        <code key={i}>{part.slice(1, -1)}</code>
      ) : (
        part
      ),
    )
}
