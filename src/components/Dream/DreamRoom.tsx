import { useEffect, useMemo, useRef, useState } from 'react'
import { closeDreamRoom } from '../../dream/room'
import { drawScene, type Scene } from '../../dream/draw'
import {
  DEFAULT_QUERY,
  DREAM_COMMIT,
  DREAM_URL,
  DURATION,
  PHASES,
  decisionFor,
  executions,
  meaningGraph,
  phaseIndex,
  relationNames,
  scenarioById,
  selectedCandidate,
  type MeaningQuery,
  type View,
} from '../../dream/model'
import { encodeVideo, webCodecsAvailable, type VideoFormat } from '../../lab/video'
import './dream.css'

function save(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob),
    link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 30_000)
}

export default function DreamRoom() {
  const [view, setView] = useState<View>('meaning')
  const [query, setQuery] = useState<MeaningQuery>(DEFAULT_QUERY)
  const [draft, setDraft] = useState(DEFAULT_QUERY.word)
  const [scenarioId, setScenarioId] = useState('ambiguous')
  const [choice, setChoice] = useState<string | null>(null)
  const [progress, setProgress] = useState(0)
  const [playing, setPlaying] = useState(() => !window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  const [format, setFormat] = useState<VideoFormat>('mp4')
  const [exportProgress, setExportProgress] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState('')
  const abort = useRef<AbortController | null>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const room = useRef<HTMLDivElement>(null)
  const graph = useMemo(() => meaningGraph(query), [query])
  const scenario = scenarioById(scenarioId)
  const decision = decisionFor(scenario, choice)
  const scene = useMemo<Scene>(
    () => ({ view, graph, scenario, decision, progress }),
    [view, graph, scenario, decision, progress],
  )
  const phase = phaseIndex(progress)
  const busy = exportProgress !== null

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    room.current?.querySelector<HTMLButtonElement>('.dream-close')?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        abort.current?.abort()
        closeDreamRoom()
      }
      if (e.key !== 'Tab') return
      const focusable = [
        ...(room.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), summary',
        ) || []),
      ].filter((el) => el.getClientRects().length > 0 && el.tabIndex >= 0)
      const first = focusable[0],
        last = focusable.at(-1)
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last?.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      abort.current?.abort()
      window.removeEventListener('keydown', onKey)
      opener?.focus()
    }
  }, [])

  useEffect(() => {
    if (!playing || busy) return
    let frame = 0,
      previous = performance.now()
    const tick = (now: number) => {
      const elapsed = Math.min(0.1, Math.max(0, (now - previous) / 1000))
      previous = now
      setProgress((p) => Math.min(1, p + elapsed / DURATION))
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [playing, busy])

  useEffect(() => {
    if (progress >= 1) setPlaying(false)
  }, [progress])

  useEffect(() => {
    const el = canvas.current
    if (!el) return
    const draw = () => {
      const { width, height } = el.getBoundingClientRect(),
        dpr = Math.min(2, window.devicePixelRatio || 1)
      if (!width || !height) return
      const pixelsWide = Math.round(width * dpr),
        pixelsHigh = Math.round(height * dpr)
      if (el.width !== pixelsWide) el.width = pixelsWide
      if (el.height !== pixelsHigh) el.height = pixelsHigh
      const ctx = el.getContext('2d')!
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      drawScene(ctx, width, height, scene)
    }
    draw()
    const observer = new ResizeObserver(draw)
    observer.observe(el)
    return () => observer.disconnect()
  }, [scene])

  const replay = () => {
    setProgress(0)
    setPlaying(true)
  }
  const switchView = (next: View) => {
    setView(next)
    setProgress(0)
    setPlaying(true)
    setError(null)
    setNotice('')
  }
  const selectScenario = (id: string) => {
    setScenarioId(id)
    setChoice(null)
    replay()
    setNotice('')
  }
  const pick = (id: string | null) => {
    setChoice(id)
    setProgress(0.64)
    setPlaying(true)
    setNotice('')
  }
  const example = (word: string, context = '料理') => {
    setDraft(word)
    setQuery({ ...DEFAULT_QUERY, word, context })
    replay()
  }
  const exportSnapshot = () => {
    const data =
      view === 'meaning'
        ? {
            kind: 'concept-model',
            query,
            graph,
            selectionRule:
              'unique positive MATCH direct relation with the requested type; explainer-specific',
          }
        : {
            kind: 'recorded-execution',
            scenario: scenario.id,
            setup: scenario.setup,
            text: scenario.text,
            decision,
          }
    save(
      new Blob([JSON.stringify({ schema: 1, sourceCommit: DREAM_COMMIT, progress, ...data }, null, 2)], {
        type: 'application/json',
      }),
      `dream-${view}.json`,
    )
  }
  const exportVideo = async () => {
    setError(null)
    setNotice('')
    setExportProgress(0)
    const controller = new AbortController()
    abort.current = controller
    // Immutable snapshot: encoding never seeks the on-screen timeline or the π lab.
    const snapshot = scene,
      fps = 30,
      frames = DURATION * fps
    try {
      const result = await encodeVideo({
        format,
        fps,
        width: 1440,
        height: 900,
        frames,
        signal: controller.signal,
        draw: (i, ctx) => drawScene(ctx, 1440, 900, { ...snapshot, progress: i / (frames - 1) }),
        onProgress: (n, total) => setExportProgress(n / total),
      })
      if (!controller.signal.aborted) {
        save(
          result.blob,
          `${view === 'meaning' ? 'dream-meaning' : `dream-implementation-${scenarioId}`}.${format}`,
        )
        setNotice(`${format.toUpperCase()} を保存しました（16秒・30fps）`)
      }
    } catch (err) {
      if (!controller.signal.aborted) setError(err instanceof Error ? err.message : String(err))
    } finally {
      abort.current = null
      setExportProgress(null)
    }
  }
  const exportPng = () => {
    const image = document.createElement('canvas')
    image.width = 1440
    image.height = 900
    drawScene(image.getContext('2d')!, 1440, 900, scene)
    image.toBlob((blob) => {
      if (blob) save(blob, `dream-${view}.png`)
    })
  }
  const detail =
    view === 'meaning'
      ? phase >= 4
        ? graph.detail
        : PHASES.meaning[phase]
      : phase >= 4
        ? decision.outcome.applied
          ? '選んだ計画を実状態へ反映した記録です。'
          : scenario.id === 'unknown'
            ? '未知語を保持し、説明を待っています。'
            : '未選択のため、世界は変わりません。'
        : PHASES.implementation[phase]

  return (
    <div
      className="dream-room"
      role="dialog"
      aria-modal="true"
      aria-labelledby="dream-title"
      data-testid="dream-room"
      ref={room}
    >
      <header className="dream-head">
        <div>
          <span className="dream-eyebrow">INFINITE LAB / ANOTHER ROOM</span>
          <h2 id="dream-title">言葉と意味の部屋</h2>
        </div>
        <button className="dream-close" onClick={closeDreamRoom}>
          π の実験へ戻る <span aria-hidden="true">↗</span>
        </button>
      </header>
      <div className="dream-intro">
        <p>
          ひとつの言葉が、いくつもの意味につながる。
          <br className="dream-mobile-break" />
          その中から、何が選ばれるのか。
        </p>
      </div>
      <div
        className="dream-tabs"
        role="tablist"
        aria-label="可視化の切替"
        onKeyDown={(e) => {
          if (busy || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return
          e.preventDefault()
          const next: View =
            e.key === 'Home'
              ? 'meaning'
              : e.key === 'End'
                ? 'implementation'
                : view === 'meaning'
                  ? 'implementation'
                  : 'meaning'
          switchView(next)
          document.getElementById(`dream-tab-${next}`)?.focus()
        }}
      >
        <button
          id="dream-tab-meaning"
          role="tab"
          tabIndex={view === 'meaning' ? 0 : -1}
          aria-selected={view === 'meaning'}
          aria-controls="dream-panel"
          disabled={busy}
          onClick={() => switchView('meaning')}
        >
          01 意味のひろがり
        </button>
        <button
          id="dream-tab-implementation"
          role="tab"
          tabIndex={view === 'implementation' ? 0 : -1}
          aria-selected={view === 'implementation'}
          aria-controls="dream-panel"
          disabled={busy}
          onClick={() => switchView('implementation')}
        >
          02 現在の Dream-box
        </button>
      </div>
      <main className="dream-layout" id="dream-panel" role="tabpanel" aria-labelledby={`dream-tab-${view}`}>
        <aside className="dream-settings" aria-label="可視化の入力">
          {view === 'meaning' ? (
            <>
              <p className="dream-section-label">言葉 → 概念 → 関係 → 選択</p>
              <h3>言葉を渡してみる</h3>
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  if (draft.trim()) {
                    setQuery({ ...query, word: draft.trim().slice(0, 40) })
                    replay()
                  }
                }}
              >
                <label htmlFor="dream-word">言葉</label>
                <div className="dream-input-row">
                  <input
                    id="dream-word"
                    value={draft}
                    maxLength={40}
                    disabled={busy}
                    onChange={(e) => setDraft(e.target.value)}
                  />
                  <button className="primary" disabled={!draft.trim() || busy}>
                    ひらく
                  </button>
                </div>
              </form>
              <div className="dream-examples" aria-label="言葉の例">
                {['じゃがいも', '大豆', 'はし'].map((word) => (
                  <button
                    key={word}
                    disabled={busy}
                    onClick={() => example(word, word === 'はし' ? '' : '料理')}
                  >
                    {word}
                  </button>
                ))}
              </div>
              <label>
                文脈
                <select
                  value={query.context}
                  disabled={busy}
                  onChange={(e) => {
                    setQuery({ ...query, context: e.target.value })
                    replay()
                  }}
                  aria-label="文脈"
                >
                  <option value="">まだ指定しない</option>
                  {['料理', '実験台', '加工', '食卓', '交通', '建設', '教材'].map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </label>
              <label>
                選ぶ観点
                <select
                  value={query.focus}
                  disabled={busy}
                  onChange={(e) => {
                    setQuery({ ...query, focus: e.target.value })
                    replay()
                  }}
                  aria-label="選ぶ観点"
                >
                  {Object.entries(relationNames).map(([id, name]) => (
                    <option key={id} value={id}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                関係に必要な条件
                <select
                  value={query.facts}
                  disabled={busy}
                  onChange={(e) => {
                    setQuery({ ...query, facts: e.target.value as MeaningQuery['facts'] })
                    replay()
                  }}
                  aria-label="関係に必要な条件"
                >
                  <option value="yes">条件を満たすと仮定</option>
                  <option value="unknown">まだ分からない</option>
                  <option value="no">条件を満たさない</option>
                </select>
              </label>
              <p className="dream-note">
                料理なら「料理に適する個体」、素材なら「木製」など。この実演に与える仮定です。
              </p>
              <p className="dream-explanation">
                登録関係を放射状にたどり、観点に合う肯定の関係が一意なら選びます。この選択規則は、この部屋での説明用モデルです。
              </p>
            </>
          ) : (
            <>
              <p className="dream-section-label">実コードから採取した記録</p>
              <h3>実装の中をたどる</h3>
              <label>
                実行例
                <select
                  value={scenarioId}
                  disabled={busy}
                  onChange={(e) => selectScenario(e.target.value)}
                  aria-label="実行例"
                >
                  {executions.cases.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title}
                    </option>
                  ))}
                </select>
              </label>
              <blockquote className="dream-utterance">{scenario.text}</blockquote>
              <p className="dream-note">
                {scenario.setup.length
                  ? `直前の入力：${scenario.setup.join(' → ')}`
                  : '初期の物理世界から開始'}
              </p>
              {scenario.decisions.length > 1 && (
                <fieldset className="dream-choices" disabled={busy}>
                  <legend>実装が作った候補</legend>
                  <label>
                    <input
                      type="radio"
                      name="dream-candidate"
                      checked={choice === null}
                      onChange={() => pick(null)}
                    />
                    未選択のまま待つ
                  </label>
                  {decision.understanding.candidates.map((c) => (
                    <label key={c.id}>
                      <input
                        type="radio"
                        name="dream-candidate"
                        checked={choice === c.id}
                        onChange={() => pick(c.id)}
                      />
                      {c.label}
                    </label>
                  ))}
                </fieldset>
              )}
              <p className="dream-explanation">
                原文保持 → 文法・参照 → 解釈候補 → 実行可否 →
                世界への反映。曖昧な対象や未知語が残ると、実行を待ちます。
              </p>
              <p className="dream-note">
                固定ケースの実行記録を再生しています。実行時AIは使っていません。上の候補を選ぶと、その選択で実行した記録へ切り替わります。
              </p>
            </>
          )}
        </aside>
        <section className="dream-observe" aria-label="アニメーション">
          <canvas
            ref={canvas}
            className="dream-canvas"
            role="img"
            aria-label={
              view === 'meaning'
                ? '入力語から登録概念と関係が放射状に広がり、指定した観点で選択する図'
                : 'Dream-boxの原文から解釈候補、確認、世界の反映までの実行記録'
            }
          />
          <div className="dream-transport">
            <button
              disabled={busy}
              onClick={() => {
                if (progress >= 1) {
                  replay()
                } else setPlaying(!playing)
              }}
            >
              {playing && progress < 1 ? '一時停止' : progress >= 1 ? 'もう一度見る' : '再生'}
            </button>
            <label className="dream-timeline">
              <span className="sr-only">時間</span>
              <input
                type="range"
                aria-label="時間"
                min="0"
                max="1"
                step="0.001"
                value={progress}
                disabled={busy}
                onChange={(e) => {
                  setPlaying(false)
                  setProgress(Number(e.target.value))
                }}
              />
            </label>
            <output className="dream-time">
              {(progress * DURATION).toFixed(1)} / {DURATION}s
            </output>
          </div>
          <p className="dream-current" aria-live="polite" data-testid="dream-current">
            {detail}
          </p>
          <div className="dream-export">
            <span>この動きを保存</span>
            <select
              aria-label="動画形式"
              value={format}
              disabled={busy}
              onChange={(e) => setFormat(e.target.value as VideoFormat)}
            >
              <option value="mp4">MP4</option>
              <option value="webm">WebM</option>
            </select>
            <button disabled={busy || !webCodecsAvailable()} onClick={exportVideo}>
              動画を保存
            </button>
            <button disabled={busy} onClick={exportPng}>
              PNG
            </button>
            <button disabled={busy} onClick={exportSnapshot}>
              記録 JSON
            </button>
            {busy && (
              <>
                <progress max="1" value={exportProgress} aria-label="動画の保存状況" />
                <button onClick={() => abort.current?.abort()}>中止</button>
              </>
            )}
          </div>
          {!webCodecsAvailable() && (
            <p className="dream-note">
              このブラウザは動画の書き出しに対応していません。PNG・JSONは保存できます。
            </p>
          )}
          {error && (
            <p className="dream-error" role="alert">
              保存できませんでした：{error}。別の動画形式を試せます。
            </p>
          )}
          {notice && (
            <p className="dream-note" role="status">
              {notice}
            </p>
          )}
        </section>
      </main>
      <section className="dream-evidence">
        <details>
          <summary>図の根拠と、現在できている範囲</summary>
          <div className="dream-evidence-grid">
            <div>
              <h3>01 は、概念をたどるモデル</h3>
              <p>
                Dream-boxの概念研究 Atlas
                に登録されている21概念・23関係を使います。種類・用途・部位などを別の関係として扱い、文脈や条件、否定を保ちます。線の長さや角度は見やすい配置で、埋め込み距離や脳内の測定値ではありません。
              </p>
              <p>
                Atlas
                の照会結果を、観点で一つに絞る規則をこの部屋に追加しています。現在のDream-boxが常にこの放射図から一つを自動選択する、という主張ではありません。
              </p>
              <a
                href={`${DREAM_URL}/experiments/concept-research/atlas/prior.json`}
                target="_blank"
                rel="noreferrer"
              >
                使った概念と関係
              </a>
              {' · '}
              <a
                href={`${DREAM_URL}/experiments/concept-research/atlas/graph-api.mjs`}
                target="_blank"
                rel="noreferrer"
              >
                Atlas の照会規則
              </a>
            </div>
            <div>
              <h3>02 は、実装の実行記録</h3>
              <p>
                main {DREAM_COMMIT.slice(0, 7)} の実エンジンを、物理世界・seed
                1で実行して採取しました。理解とプレビューが世界を変えないこと、未選択・未知語で物体が変わらないことも検査しています。表示時間を16秒に伸ばしており、処理速度の測定ではありません。
              </p>
              <p>
                3D部分は記録された座標・形・色の簡略投影です。物理エンジンをこの部屋で再実行するものではありません。汎用の分かち書きに加え、物理文法や照応の処理も別にあります。
              </p>
              <a
                href={`${DREAM_URL}/experiments/text-to-living-world/src/meaning/index.js`}
                target="_blank"
                rel="noreferrer"
              >
                理解・候補・プレビュー・反映の実装
              </a>
              {' · '}
              <a
                href={`${DREAM_URL}/experiments/text-to-living-world/src/main.js`}
                target="_blank"
                rel="noreferrer"
              >
                アプリからの呼び出し
              </a>
            </div>
          </div>
          <p>
            概念図鑑Aと、経験から記憶を育てるBは独立した研究です。現在の本文解析から、研究結果がそのまま世界へ自動反映される接続にはしていません。
          </p>
        </details>
        <details>
          <summary>{view === 'meaning' ? '今回たどった登録関係' : '今回の実行データ'}</summary>
          {view === 'meaning' ? (
            <div className="dream-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>概念</th>
                    <th>関係</th>
                    <th>つながる先</th>
                    <th>状態</th>
                  </tr>
                </thead>
                <tbody>
                  {graph.nodes.map((n) => (
                    <tr key={n.id}>
                      <td>
                        {n.depth === 1 ? query.word : graph.nodes.find((p) => p.id === n.parent)?.label}
                      </td>
                      <td>{relationNames[n.type] || n.type}</td>
                      <td>{n.label}</td>
                      <td>
                        {n.negated
                          ? '否定'
                          : n.status === 'PENDING'
                            ? '条件待ち'
                            : graph.selected === n.id
                              ? '選択'
                              : '成立'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!graph.nodes.length && <p>{graph.detail}</p>}
            </div>
          ) : (
            <>
              <p>
                解釈：{decision.understanding.interpretation} / 実現：{decision.understanding.realization} /
                選択：{decision.understanding.selectedCandidateId || 'なし'}
              </p>
              <p>
                計画：{selectedCandidate(decision)?.plan.status || '未選択'} / 反映ID：
                {decision.outcome.applied?.entities.join(', ') || 'なし'}
              </p>
              <p>
                参照：
                {decision.understanding.references
                  .map((r) => `${r.surface} → ${r.candidates.map((c) => c.id).join(' / ')}`)
                  .join('、') || 'なし'}
              </p>
              <p>保留語：{decision.held.map((h) => h.word).join('、') || 'なし'}</p>
            </>
          )}
        </details>
      </section>
    </div>
  )
}
