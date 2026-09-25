import { useState } from 'react'
import { getController } from '../../app/LabController'
import { EXPERIMENTS, getExperiment } from '../../experiments/registry'
import { PRECISIONS, useLab } from '../../state/labStore'
import { formatInt } from '../../utils/format'

const UPCOMING_EXPERIMENTS = ['Circle Chain', 'Pi Rotation']
const UPCOMING_CONSTANTS = ['e', '√2', 'φ']

export function ExperimentPanel() {
  const c = getController()
  const experimentId = useLab((s) => s.experimentId)
  const params = useLab((s) => s.params)
  const precision = useLab((s) => s.precision)
  const digitStart = useLab((s) => s.digitStart)
  const phase = useLab((s) => s.phase)
  const def = getExperiment(experimentId)

  return (
    <div className="side-panel">
      <section>
        <div className="panel-title">Experiment</div>
        <select
          value={experimentId}
          onChange={(e) => c.setExperiment(e.target.value)}
          aria-label="Experiment"
        >
          {Object.values(EXPERIMENTS).map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
            </option>
          ))}
          {UPCOMING_EXPERIMENTS.map((n) => (
            <option key={n} disabled>
              {n} (v0.2)
            </option>
          ))}
        </select>
        <p className="muted small">{def.description}</p>
      </section>

      <section>
        <div className="panel-title">Constant</div>
        <select value="pi" aria-label="Constant" onChange={() => undefined}>
          <option value="pi">π — Pi</option>
          {UPCOMING_CONSTANTS.map((n) => (
            <option key={n} disabled>
              {n} (v0.2)
            </option>
          ))}
        </select>
      </section>

      <section>
        <div className="panel-title">Precision</div>
        <select
          value={precision}
          onChange={(e) => c.setPrecision(Number(e.target.value))}
          disabled={phase === 'computing'}
          aria-label="Precision"
          data-testid="precision"
        >
          {PRECISIONS.map((p) => (
            <option key={p} value={p}>
              {formatInt(p)} digits
            </option>
          ))}
        </select>
        <div className="radio-row">
          <label>
            <input
              type="radio"
              checked={digitStart === 'integer'}
              onChange={() => c.setDigitStart('integer')}
            />
            start at 3.
          </label>
          <label>
            <input
              type="radio"
              checked={digitStart === 'fractional'}
              onChange={() => c.setDigitStart('fractional')}
            />
            start at .1
          </label>
        </div>
      </section>

      <section>
        <div className="panel-title">Parameters</div>
        {def.parameters.map((p) =>
          p.type === 'number' ? (
            <NumberParam
              key={`${experimentId}:${p.key}`}
              label={p.label}
              min={p.min}
              max={p.max}
              step={p.step}
              value={params[p.key] as number}
              onCommit={(v) => c.setParam(p.key, v)}
            />
          ) : (
            <label key={p.key} className="param">
              <span>{p.label}</span>
              <input
                type="checkbox"
                checked={params[p.key] as boolean}
                onChange={(e) => c.setParam(p.key, e.target.checked)}
              />
            </label>
          ),
        )}
        <p className="muted small">
          Press Enter to apply. Changing parameters restarts the experiment from step 0.
        </p>
      </section>
    </div>
  )
}

/**
 * Numeric parameter field. Typing edits a local draft; the value is validated, clamped and
 * applied (restarting the experiment) only on Enter or blur, and only if it changed.
 */
function NumberParam(props: {
  label: string
  min: number
  max: number
  step: number
  value: number
  onCommit: (value: number) => void
}) {
  const { label, min, max, step, value, onCommit } = props
  const [draft, setDraft] = useState<string | null>(null)
  const commit = () => {
    if (draft === null) return
    const v = Number(draft)
    setDraft(null)
    if (draft.trim() === '' || !Number.isFinite(v)) return // invalid → keep the current value
    const clamped = Math.min(max, Math.max(min, v))
    if (clamped !== value) onCommit(clamped)
  }
  return (
    <label className="param" title={`${min} – ${max}`}>
      <span>{label}</span>
      <input
        type="number"
        className="mono"
        min={min}
        max={max}
        step={step}
        value={draft ?? String(value)}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit()
          else if (e.key === 'Escape') setDraft(null)
        }}
        aria-label={label}
      />
    </label>
  )
}
