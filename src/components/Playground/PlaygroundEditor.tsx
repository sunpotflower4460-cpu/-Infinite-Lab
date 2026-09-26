import { useEffect, useRef, useState } from 'react'
import { getController } from '../../app/LabController'
import {
  checkSources,
  PLAYGROUND_KEYS,
  PLAYGROUND_LABELS,
  PLAYGROUND_VARIABLES,
  type PlaygroundSources,
} from '../../experiments/playground'
import { FUNCTIONS } from '../../experiments/core/formula'
import { useLab } from '../../state/labStore'

/** Apply this long after the last keystroke (spec §10: "変更すると即座に再計算"). */
const APPLY_DELAY_MS = 500

/**
 * Formula Playground editor. Every keystroke is parsed; valid formulas are applied after a
 * short pause (or on Enter) and restart the experiment. Invalid drafts are marked where the
 * problem is, and the last valid formulas keep running.
 */
export function PlaygroundEditor() {
  const c = getController()
  const applied = useLab((s) => s.formulas)
  const [drafts, setDrafts] = useState<PlaygroundSources>(applied)
  const timer = useRef<number | undefined>(undefined)

  // A preset, import or history entry replaced the formulas: show them.
  useEffect(() => setDrafts(applied), [applied])
  useEffect(() => () => window.clearTimeout(timer.current), [])

  const errors = checkSources(drafts)
  const valid = Object.keys(errors).length === 0
  const changed = PLAYGROUND_KEYS.some((k) => drafts[k] !== applied[k])

  const apply = (next: PlaygroundSources) => {
    window.clearTimeout(timer.current)
    if (Object.keys(checkSources(next)).length > 0) return
    if (PLAYGROUND_KEYS.every((k) => next[k] === applied[k])) return
    c.setFormulas(next)
  }
  const edit = (key: keyof PlaygroundSources, value: string) => {
    const next = { ...drafts, [key]: value }
    setDrafts(next)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => apply(next), APPLY_DELAY_MS)
  }

  return (
    <section data-testid="playground">
      <div className="panel-title">Formulas</div>
      {PLAYGROUND_KEYS.map((key) => {
        const err = errors[key]
        const src = drafts[key]
        return (
          <div key={key} className="formula-field">
            <label>
              <span>{PLAYGROUND_LABELS[key]}</span>
              <input
                className={`mono${err ? ' invalid' : ''}`}
                value={src}
                spellCheck={false}
                autoCapitalize="off"
                autoComplete="off"
                onChange={(e) => edit(key, e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') apply(drafts)
                  else if (e.key === 'Escape') setDrafts(applied)
                }}
                aria-label={`${PLAYGROUND_LABELS[key]} formula`}
                aria-invalid={err ? true : undefined}
              />
            </label>
            {err && (
              <div className="formula-error" role="alert" data-testid={`formula-error-${key}`}>
                <span className="mono">
                  {src.slice(0, err.start)}
                  <mark>{src.slice(err.start, err.end) || ' '}</mark>
                  {src.slice(err.end)}
                </span>
                <span>{err.message}</span>
              </div>
            )}
          </div>
        )
      })}
      <p className="muted small" data-testid="playground-state">
        {!valid
          ? 'Not applied: the previous formulas keep running.'
          : changed
            ? 'Applying…'
            : 'Running these formulas. Changes restart from step 0.'}
      </p>
      <details className="small muted">
        <summary>Syntax</summary>
        <p>
          Names: {PLAYGROUND_VARIABLES.join(', ')}, π. Functions: {FUNCTIONS.join(', ')}. Operators: + − × /
          mod ( ). "2π" = 2 × π.
        </p>
        <p>
          Everything runs in float64 with π = 3.141592653589793, like the other experiments. The selected
          constant C is available only exactly: <code>(n × 0.1 × C) mod 2π</code> or{' '}
          <code>(n × C) mod 360</code> are reduced in BigInt with ~120 digits of C.
        </p>
        <p>
          The walker then moves: x = x[n−1] + cos(angle) × distance, y likewise; a circle of RADIUS is drawn.
        </p>
      </details>
    </section>
  )
}
