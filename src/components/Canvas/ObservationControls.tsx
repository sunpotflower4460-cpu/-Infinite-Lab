import { useEffect, useRef } from 'react'
import { useStore } from 'zustand'
import type { LabController } from '../../app/LabController'
import { TorusReadout } from './TorusReadout'
import { TWO_ARM_VIEWS } from '../../experiments/two-arm-3d'
import {
  overlayRule,
  hasThirdFlow,
  thirdRule,
  type OverlayMode,
  type Presentation,
} from '../../lab/presentation'

export function ObservationControls({
  controller,
  film = false,
}: {
  controller: LabController
  film?: boolean
}) {
  const panel = useRef<HTMLDivElement>(null)
  const p = useStore(controller.store, (s) => s.presentation)
  const id = useStore(controller.store, (s) => s.experimentId)
  const step = useStore(controller.store, (s) => s.currentStep)
  const visibleStep = useStore(controller.store, (s) => s.viewStep ?? s.currentStep)
  const switching = useStore(controller.store, (s) => s.switching)
  const compare = useStore(controller.store, (s) => s.compareConstant)
  const video = useStore(controller.store, (s) => s.video.status)
  const family = TWO_ARM_VIEWS.some((v) => v.id === id)
  const set = (update: Partial<Presentation>) => controller.setPresentation(update)
  const third = hasThirdFlow(p, id === 'two-arm-torus')
  const circleRecords = useStore(controller.store, (s) => s.thirdCircleRecords)
  const circleError = useStore(controller.store, (s) => s.thirdCircleError)
  useEffect(() => {
    const node = panel.current
    const stage = node?.closest<HTMLElement>('.stage')
    if (!node || !stage) return
    const resize = () => {
      if (film)
        stage.style.setProperty('--film-controls-bottom', node.offsetTop + node.offsetHeight + 8 + 'px')
      const rect = node.getBoundingClientRect()
      const above = rect.top - 8,
        below = window.innerHeight - rect.bottom - 8
      const down = film || below > above
      node.dataset.optionsSide = down ? 'below' : 'above'
      node.style.setProperty('--observation-options-height', Math.max(96, down ? below : above) + 'px')
    }
    const observer = new ResizeObserver(resize)
    observer.observe(node)
    observer.observe(stage)
    window.addEventListener('resize', resize)
    resize()
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', resize)
      stage.style.removeProperty('--film-controls-bottom')
    }
  }, [film])

  return (
    <div
      ref={panel}
      className={`observation-controls ${film ? 'film-observation' : ''}`}
      data-testid="observation-controls"
    >
      <fieldset disabled={video === 'recording' || switching !== null}>
        <div className="observation-row">
          <span>形</span>
          <div className="view-switch" role="group" aria-label="Two-Arm view">
            {TWO_ARM_VIEWS.map((v) => (
              <button
                key={v.id}
                aria-pressed={v.id === id}
                className={v.id === id ? 'active' : ''}
                onClick={() => id !== v.id && controller.switchView(v.id)}
              >
                {v.label}
              </button>
            ))}
          </div>
          {!film && family && (
            <button
              aria-pressed={compare === 'frac-22-7'}
              title="別の定数との比較。陰陽の2流れとは別の操作です。"
              onClick={() =>
                compare === 'frac-22-7' ? controller.disableCompare() : controller.enableCompare('frac-22-7')
              }
            >
              vs 22/7
            </button>
          )}
        </div>
        <div className="observation-row">
          <span>重ね方</span>
          <div className="view-switch" role="group" aria-label="重ね方">
            {(
              [
                ['solo', 'Solo'],
                ['mirror', '左右対称'],
                ['yin-yang', '陰陽'],
              ] as [OverlayMode, string][]
            ).map(([mode, label]) => (
              <button
                key={mode}
                aria-pressed={p.mode === mode}
                className={p.mode === mode ? 'active' : ''}
                onClick={() => set({ mode })}
              >
                {label}
              </button>
            ))}
          </div>
          <label>
            Trail{' '}
            <select
              aria-label="Trail"
              value={p.trail}
              onChange={(e) => set({ trail: Number(e.target.value) })}
            >
              <option value={0}>全履歴</option>
              <option value={100}>100</option>
              <option value={300}>300</option>
              <option value={1000}>1,000</option>
              <option value={10000}>10,000</option>
            </select>
          </label>
          <details className="observation-options">
            <summary>調整</summary>
            <div>
              {id === 'two-arm-torus' && (
                <div className="torus-presets" role="group" aria-label="トーラスの腕長">
                  <span>腕長プリセット（半径はscale倍）</span>
                  <button onClick={() => controller.switchView(id, { r1: 1.3, r2: 1 })}>
                    穴あり 腕1=1.3, 腕2=1
                  </button>
                  <button onClick={() => controller.switchView(id, { r1: 1, r2: 1 })}>
                    穴なし 腕1=腕2=1
                  </button>
                </div>
              )}
              {id === 'two-arm-torus' && (
                <div className="third-options">
                  <label>
                    第3の濃さ{' '}
                    <input
                      aria-label="第3の濃さ"
                      type="range"
                      min="0"
                      max="1"
                      step="0.01"
                      value={p.thirdOpacity}
                      onChange={(e) => set({ thirdOpacity: Number(e.target.value) })}
                    />
                  </label>
                  {p.thirdModel === 'phase' ? (
                    <>
                      <span className="muted small">旧ファイルの位相モデルを復元しています。</span>
                      <button
                        onClick={() =>
                          set({ thirdModel: 'circle', thirdFlow: true, thirdOpacity: 0.65, flow: 'both' })
                        }
                      >
                        第3の円に切替
                      </button>
                      <label>
                        第3の位相{' '}
                        <select
                          aria-label="第3の位相"
                          value={p.thirdQuarter}
                          onChange={(e) => set({ thirdQuarter: e.target.value === '1' ? 1 : -1 })}
                        >
                          <option value={1}>大円 +90°</option>
                          <option value={-1}>大円 −90°</option>
                        </select>
                      </label>
                    </>
                  ) : (
                    <>
                      <label>
                        第3の半径 / 管半径{' '}
                        <input
                          aria-label="第3の半径 / 管半径"
                          type="number"
                          min="0"
                          max="3"
                          step="0.1"
                          value={p.thirdRadius}
                          onChange={(e) => {
                            const value = Number(e.target.value)
                            if (Number.isFinite(value) && value >= 0 && value <= 3)
                              set({ thirdRadius: value })
                          }}
                        />
                      </label>
                      <label>
                        <input
                          type="checkbox"
                          aria-label="3つの作図円"
                          checked={p.thirdGuides}
                          onChange={(e) => set({ thirdGuides: e.target.checked })}
                        />{' '}
                        3つの作図円と先端を表示
                      </label>
                      <label>
                        <input
                          type="checkbox"
                          aria-label="第3の先端の軌跡"
                          checked={p.thirdTrace}
                          onChange={(e) => set({ thirdTrace: e.target.checked })}
                        />{' '}
                        第3の先端の軌跡も表示
                      </label>
                      <span className="muted small">
                        第3はPを中心に回転。ω₃=C²t、半径は管半径の指定倍率です。
                      </span>
                    </>
                  )}
                  <label>
                    <input
                      type="checkbox"
                      aria-label="トーラス面の補助表示"
                      checked={p.torusSurface}
                      onChange={(e) => set({ torusSurface: e.target.checked })}
                    />{' '}
                    トーラス面を薄く表示（補助）
                  </label>
                </div>
              )}
              <label>
                配色{' '}
                <select
                  aria-label="配色"
                  value={p.palette}
                  onChange={(e) => set({ palette: e.target.value as Presentation['palette'] })}
                >
                  <option value="gold-blue">金 / 青灰</option>
                  <option value="ivory-slate">白 / 墨灰</option>
                  <option value="jade-rose">翡翠 / 薄紅</option>
                </select>
              </label>
              <label>
                表示{' '}
                <select
                  aria-label="表示する流れ"
                  value={p.flow}
                  onChange={(e) => set({ flow: e.target.value as Presentation['flow'] })}
                >
                  <option value="both">{third ? '全ての軌跡' : '両方'}</option>
                  <option value="original">元 / 陰のみ</option>
                  {p.mode !== 'solo' && <option value="derived">鏡像 / 陽のみ</option>}
                  {third && <option value="third">第3の先端のみ</option>}
                </select>
              </label>
              <label>
                透明度{' '}
                <input
                  aria-label="透明度"
                  type="range"
                  min="0.05"
                  max="1"
                  step="0.05"
                  value={p.opacity}
                  onChange={(e) => set({ opacity: Number(e.target.value) })}
                />
              </label>
              <label>
                線幅{' '}
                <input
                  aria-label="線幅"
                  type="range"
                  min="0.5"
                  max="4"
                  step="0.5"
                  value={p.width}
                  onChange={(e) => set({ width: Number(e.target.value) })}
                />
              </label>
              <label>
                発光量{' '}
                <input
                  aria-label="発光量"
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  value={p.glow}
                  onChange={(e) => set({ glow: Number(e.target.value) })}
                />
              </label>
            </div>
          </details>
        </div>
        {id === 'two-arm-torus' && (
          <label className="third-flow-toggle">
            <input
              type="checkbox"
              aria-label="第3の円を追加"
              checked={third}
              onChange={(e) =>
                set(
                  e.target.checked
                    ? {
                        thirdFlow: true,
                        thirdModel: 'circle',
                        flow: 'both',
                        thirdOpacity: p.thirdModel === 'phase' ? 0.65 : p.thirdOpacity,
                      }
                    : { thirdFlow: false, flow: p.flow === 'third' ? 'both' : p.flow },
                )
              }
            />
            第3の円を追加
          </label>
        )}
      </fieldset>
      <div className="observation-rule" data-testid="overlay-rule">
        {overlayRule(p.mode)}
      </div>
      {id === 'two-arm-torus' && <TorusReadout controller={controller} />}
      {third && (
        <div className="observation-rule third-rule" data-testid="third-rule">
          {thirdRule(p)} 濃さ {Math.round(p.thirdOpacity * 100)}%
          {p.thirdModel === 'circle' && (
            <div data-testid="third-circle-status">
              {circleError
                ? circleError
                : circleRecords < step
                  ? `第3を計算中… ${circleRecords.toLocaleString()} / ${step.toLocaleString()}`
                  : `第3の先端 Q · ${circleRecords.toLocaleString()}点`}
            </div>
          )}
        </div>
      )}
      {id === 'two-arm-sphere-lift' && (
        <div className="observation-rule">
          x・yは2Dと同一。z = 2·scale·√(r₁r₂)·sin δ。点は球面、結ぶ線分は弦です。
        </div>
      )}
      {p.width !== 1 && id !== 'two-arm' && Math.min(visibleStep, p.trail || Infinity) >= 50_000 && (
        <div className="observation-rule">
          高密度のため細い線で表示しています。Trailを短くすると指定の線幅に戻ります。
        </div>
      )}
      {switching !== null && (
        <div role="status">
          同じstepへ再計算中… {step.toLocaleString()} / {switching.toLocaleString()}
        </div>
      )}
    </div>
  )
}
