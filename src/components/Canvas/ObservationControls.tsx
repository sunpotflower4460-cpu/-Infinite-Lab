import { useStore } from 'zustand'
import type { LabController } from '../../app/LabController'
import { TWO_ARM_VIEWS } from '../../experiments/two-arm-3d'
import { overlayRule, type OverlayMode, type Presentation } from '../../lab/presentation'

export function ObservationControls({
  controller,
  film = false,
}: {
  controller: LabController
  film?: boolean
}) {
  const p = useStore(controller.store, (s) => s.presentation)
  const id = useStore(controller.store, (s) => s.experimentId)
  const step = useStore(controller.store, (s) => s.currentStep)
  const visibleStep = useStore(controller.store, (s) => s.viewStep ?? s.currentStep)
  const switching = useStore(controller.store, (s) => s.switching)
  const compare = useStore(controller.store, (s) => s.compareConstant)
  const video = useStore(controller.store, (s) => s.video.status)
  const family = TWO_ARM_VIEWS.some((v) => v.id === id)
  const set = (update: Partial<Presentation>) => controller.setPresentation(update)
  return (
    <div
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
                  <option value="both">両方</option>
                  <option value="original">元 / 陰のみ</option>
                  <option value="derived">鏡像 / 陽のみ</option>
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
      </fieldset>
      <div className="observation-rule" data-testid="overlay-rule">
        {overlayRule(p.mode)}
      </div>
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
