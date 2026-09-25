import { getController } from '../../app/LabController'
import { useLab } from '../../state/labStore'
import { formatInt } from '../../utils/format'

/** Scientific Mode (spec §21): how the numbers on screen were produced. */
export function ScientificOverlay() {
  const on = useLab((s) => s.scientific)
  const constant = useLab((s) => s.constant)
  const step = useLab((s) => s.currentStep)
  const fps = useLab((s) => s.fps)
  const objects = useLab((s) => s.objects)
  const sps = useLab((s) => s.stepsPerSecond)
  const batchMs = useLab((s) => s.lastBatchMs)
  const renderMs = useLab((s) => s.renderMs)
  const layerMode = useLab((s) => s.layerMode)
  if (!on) return null
  const rows: [string, string][] = [
    ['Algorithm', constant?.algorithm ?? '—'],
    [
      `${constant?.symbol ?? 'π'} Precision`,
      constant ? `${formatInt(constant.precision)} digits (truncated)` : '—',
    ],
    ['Constant compute time', constant ? `${constant.computeTimeMs.toFixed(1)} ms` : '—'],
    ['Iteration', formatInt(step)],
    ['Steps / s', formatInt(sps)],
    ['Batch compute', `${batchMs.toFixed(2)} ms`],
    ['Renderer FPS (on demand)', String(fps)],
    ['Last render call', `${renderMs.toFixed(1)} ms`],
    ['Objects', formatInt(objects)],
    ['Geometry arithmetic', 'IEEE-754 float64'],
    ['sin / cos', 'fdlibm port (deterministic)'],
    ['π inside formulas', 'float64 3.141592653589793'],
    ['(… × C) mod m', 'BigInt, C to 120 decimals'],
    ['Randomness', 'none'],
  ]
  return (
    <div className="scientific" data-testid="scientific">
      <div className="panel-title">Scientific Mode</div>
      <dl>
        {rows.map(([k, v]) => (
          <div key={k} className="sci-row">
            <dt>{k}</dt>
            <dd className="mono">{v}</dd>
          </div>
        ))}
      </dl>
      <label className="sci-row">
        <span className="muted">Geometry layer</span>
        <select
          value={layerMode}
          onChange={(e) => getController().setLayerMode(e.target.value as 'instanced' | 'graphics')}
          aria-label="Geometry layer"
        >
          <option value="instanced">Instanced SDF</option>
          <option value="graphics">Graphics (tessellated)</option>
        </select>
      </label>
    </div>
  )
}
