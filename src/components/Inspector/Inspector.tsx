import { useState } from 'react'
import { getController } from '../../app/LabController'
import { useLab } from '../../state/labStore'
import { formatExact, formatInt, ordinal } from '../../utils/format'
import { FormulaViewer } from '../FormulaViewer/FormulaViewer'

export function Inspector() {
  const c = getController()
  const inspected = useLab((s) => s.inspected)
  const current = useLab((s) => s.currentTrace)
  const currentStep = useLab((s) => s.currentStep)
  const trace = inspected ?? current
  const [query, setQuery] = useState('')

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const n = Number(query.replace(/,/g, ''))
    if (Number.isInteger(n) && n >= 1 && n <= currentStep) c.inspect(n)
  }

  return (
    <div className="inspector" data-testid="inspector">
      <div className="panel-title">
        Inspector{' '}
        {inspected ? <span className="badge">pinned</span> : <span className="muted">current step</span>}
      </div>
      {!trace ? (
        <p className="muted">No step executed yet.</p>
      ) : (
        <>
          <dl className="readings">
            <dt>STEP</dt>
            <dd className="mono" data-testid="inspector-step">
              {formatInt(trace.step)}
            </dd>
            <dt>DIGIT</dt>
            <dd className="mono big">{trace.digit}</dd>
            <dt>SOURCE</dt>
            <dd className="mono">
              {trace.digitPlace === 'integer' ? 'integer part' : `${ordinal(trace.digitPlace)} decimal place`}
            </dd>
            {trace.evaluations.map((ev) => (
              <FragmentRow key={ev.target} label={ev.target.toUpperCase()} value={formatExact(ev.value)} />
            ))}
          </dl>
          <div className="panel-subtitle">Formula</div>
          <FormulaViewer compact />
          <div className="panel-subtitle">Geometry</div>
          <ul className="instructions mono">
            {trace.instructions.map((g, i) => (
              <li key={i}>
                {g.type === 'circle' &&
                  `circle(x=${formatExact(g.x)}, y=${formatExact(g.y)}, r=${formatExact(g.radius)})`}
                {g.type === 'line' &&
                  `line(${formatExact(g.x1)}, ${formatExact(g.y1)} → ${formatExact(g.x2)}, ${formatExact(g.y2)})`}
                {g.type === 'point' && `point(${formatExact(g.x)}, ${formatExact(g.y)})`}
                {g.type === 'arc' &&
                  `arc(${formatExact(g.x)}, ${formatExact(g.y)}, r=${formatExact(g.radius)}, start=${formatExact(g.startAngle)}, sweep=${formatExact(g.sweep)})`}
              </li>
            ))}
          </ul>
          <p className="muted small">
            Values are IEEE-754 float64, shown in full (shortest round-trip form).
          </p>
        </>
      )}
      <form className="inspect-form" onSubmit={submit}>
        <input
          className="mono"
          inputMode="numeric"
          placeholder={currentStep > 0 ? `step 1–${formatInt(currentStep)}` : 'step'}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Inspect step"
        />
        <button type="submit" disabled={currentStep === 0}>
          Inspect
        </button>
        {inspected && (
          <button type="button" onClick={() => c.clearInspection()}>
            Current
          </button>
        )}
      </form>
    </div>
  )
}

function FragmentRow({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt>{label}</dt>
      <dd className="mono">{value}</dd>
    </>
  )
}
