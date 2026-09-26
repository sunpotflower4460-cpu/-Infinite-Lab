import { useEffect, useState } from 'react'
import { getController } from '../../app/LabController'
import { useLab } from '../../state/labStore'
import { formatInt } from '../../utils/format'

const parse = (s: string) => Number(s.replace(/[,\s]/g, ''))

/**
 * Mathematical Microscope (spec §38): pick a step range, e.g. 120,380 → 120,500, and see only
 * that part of the structure, magnified. Earlier steps can stay as faint context.
 */
export function MicroscopePanel() {
  const c = getController()
  const microscope = useLab((s) => s.microscope)
  const currentStep = useLab((s) => s.currentStep)
  const ready = useLab((s) => s.phase === 'ready')
  const focus = useLab((s) => s.inspected?.step ?? s.viewStep ?? s.currentStep)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const context = microscope?.context ?? 'dim'

  useEffect(() => {
    if (microscope) {
      setFrom(String(microscope.from))
      setTo(String(microscope.to))
    }
  }, [microscope])

  const apply = (a: number, b: number, ctx = context) => {
    if (!Number.isFinite(a) || !Number.isFinite(b)) return
    c.setMicroscope(Math.min(a, b), Math.max(a, b), ctx)
  }
  const around = (n: number) => apply(focus - n, focus + n)

  return (
    <div className="observer" data-testid="microscope">
      <div className="panel-title">
        Microscope{' '}
        {microscope && (
          <span className="badge" data-testid="microscope-range">
            {formatInt(microscope.from)}–{formatInt(microscope.to)}
          </span>
        )}
      </div>
      <form
        className="microscope-range"
        onSubmit={(e) => {
          e.preventDefault()
          apply(parse(from), parse(to))
        }}
      >
        <input
          className="mono"
          inputMode="numeric"
          placeholder="from step"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          aria-label="Microscope from step"
        />
        <span className="muted">–</span>
        <input
          className="mono"
          inputMode="numeric"
          placeholder="to step"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          aria-label="Microscope to step"
        />
        <button type="submit" disabled={!ready || currentStep === 0}>
          Zoom
        </button>
      </form>
      <div className="observer-row">
        <span className="muted small">around step {formatInt(focus)}:</span>
        {[50, 500].map((n) => (
          <button key={n} onClick={() => around(n)} disabled={!ready || currentStep === 0}>
            ±{n}
          </button>
        ))}
      </div>
      <div className="observer-row">
        <span className="muted small">earlier steps:</span>
        {(['dim', 'hide'] as const).map((k) => (
          <button
            key={k}
            className={context === k ? 'active' : ''}
            aria-pressed={context === k}
            onClick={() => microscope && apply(microscope.from, microscope.to, k)}
            disabled={!microscope}
          >
            {k === 'dim' ? 'faint' : 'hidden'}
          </button>
        ))}
        {microscope && (
          <button onClick={() => c.clearMicroscope()} aria-label="Exit microscope">
            Exit
          </button>
        )}
      </div>
      <p className="muted small">
        Shows only the chosen steps, framed to fill the view. Clicks select inside the range; SVG / CSV / PNG
        export exactly the range.
      </p>
    </div>
  )
}
