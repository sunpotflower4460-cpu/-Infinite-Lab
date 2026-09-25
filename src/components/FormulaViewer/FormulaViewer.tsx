import { formulaLines, getExperiment } from '../../experiments/registry'
import { useLab } from '../../state/labStore'
import { formatExact } from '../../utils/format'

/**
 * Shows the rule that is actually executed. Symbolic forms come from the same AST the
 * simulation evaluates; substituted forms and values come from re-executing the step.
 */
export function FormulaViewer({
  compact = false,
  source = 'focus',
}: {
  compact?: boolean
  source?: 'focus' | 'current'
}) {
  const experimentId = useLab((s) => s.experimentId)
  // 'focus' follows a pinned (inspected) step.
  // 'current' follows the running step, or the Timeline position when looking at the past.
  const trace = useLab((s) =>
    source === 'current' && s.viewStep === null ? s.currentTrace : (s.inspected ?? s.currentTrace),
  )
  const symbol = useLab((s) => s.constant?.symbol ?? 'C')
  const def = getExperiment(experimentId)

  if (!trace) {
    return (
      <div className="formulas" data-testid={`formulas-${source}`}>
        {formulaLines(def, symbol).map((line, i) => (
          <div key={def.formulas[i]!.target} className="formula">
            <span className="mono">{line}</span>
            {!compact && def.formulas[i]!.note && <span className="muted note">{def.formulas[i]!.note}</span>}
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="formulas" data-testid={`formulas-${source}`}>
      {trace.evaluations.map((ev) => (
        <div key={ev.target} className="formula">
          <span className="mono symbolic">{ev.symbolic}</span>
          <span className="mono substituted">
            = {ev.substituted} = <strong>{formatExact(ev.value)}</strong>
          </span>
          {!compact && ev.note && <span className="muted note">{ev.note}</span>}
        </div>
      ))}
    </div>
  )
}
