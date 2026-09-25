import { useEffect, useState } from 'react'
import { getController } from '../../app/LabController'
import { useLab } from '../../state/labStore'
import { formatInt } from '../../utils/format'
import { MAX_PRECISION } from '../../lab/config'

/**
 * Timeline (spec §18): 0 ──●── total. Dragging back hides later geometry without
 * recomputing; releasing beyond the computed head computes up to that step.
 */
export function Timeline() {
  const c = getController()
  const currentStep = useLab((s) => s.currentStep)
  const totalSteps = useLab((s) => s.totalSteps)
  const viewStep = useLab((s) => s.viewStep)
  const finished = useLab((s) => s.finished)
  const continuous = useLab((s) => s.continuous)
  const extending = useLab((s) => s.extending)
  const waiting = useLab((s) => s.waiting)
  const precision = useLab((s) => s.constant?.precision ?? 0)
  const ready = useLab((s) => s.phase === 'ready')
  const position = viewStep ?? currentStep
  const [drag, setDrag] = useState<number | null>(null)
  const [goto, setGoto] = useState('')

  useEffect(() => setDrag(null), [position])

  const shown = drag ?? position
  const max = Math.max(totalSteps, 1)
  const computedPct = (currentStep / max) * 100

  const onInput = (v: number) => {
    setDrag(v)
    if (v <= currentStep) c.seek(v) // looking back is cheap: apply live
  }
  const commit = () => {
    if (drag !== null && drag > currentStep) c.seek(drag) // computing forward: on release only
  }

  return (
    <div className="timeline" data-testid="timeline">
      <div className="timeline-track">
        <div className="timeline-computed" style={{ width: `${computedPct}%` }} />
        <input
          type="range"
          min={0}
          max={max}
          step={1}
          value={shown}
          disabled={!ready || totalSteps === 0}
          onChange={(e) => onInput(Number(e.target.value))}
          onPointerUp={commit}
          onKeyUp={commit}
          aria-label="Timeline"
        />
      </div>
      <span className="mono timeline-label">
        {viewStep !== null && <span className="badge">viewing</span>} {formatInt(shown)} /{' '}
        {formatInt(totalSteps)}
      </span>
      <form
        className="timeline-goto"
        onSubmit={(e) => {
          e.preventDefault()
          const n = Number(goto.replace(/,/g, ''))
          if (Number.isInteger(n) && n >= 0) c.seek(n)
          setGoto('')
        }}
      >
        <input
          className="mono"
          inputMode="numeric"
          placeholder="go to step"
          value={goto}
          disabled={!ready}
          onChange={(e) => setGoto(e.target.value)}
          aria-label="Go to step"
        />
      </form>
      {viewStep !== null && (
        <button onClick={() => c.seek(currentStep)} title="Back to the computed head">
          Latest
        </button>
      )}
      {extending && (
        <span className="badge" data-testid="extending">
          {waiting ? 'waiting for digits: ' : ''}computing {formatInt(extending.to)} digits…
        </span>
      )}
      {finished && viewStep === null && !extending && (
        <span className="badge">
          {continuous && precision >= MAX_PRECISION
            ? `${formatInt(MAX_PRECISION)}-digit limit reached`
            : 'all computed digits consumed'}
        </span>
      )}
    </div>
  )
}
