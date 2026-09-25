import { useLab } from '../../state/labStore'
import { formatInt } from '../../utils/format'

/** Always-visible readings (spec §5.6). */
export function StatusStrip() {
  const constant = useLab((s) => s.constant)
  const step = useLab((s) => s.currentStep)
  const trace = useLab((s) => s.currentTrace)
  const precision = useLab((s) => s.precision)
  const objects = useLab((s) => s.objects)
  return (
    <div className="status-strip" data-testid="status">
      <Reading label="Constant" value={constant?.symbol ?? 'π'} accent />
      <Reading label="Current Step" value={formatInt(step)} testId="current-step" />
      <Reading
        label="Current Digit"
        value={trace && step > 0 ? String(trace.digit) : '—'}
        testId="current-digit"
      />
      <Reading label="Precision" value={`${formatInt(constant?.precision ?? precision)} digits`} />
      <Reading label="Generated Objects" value={formatInt(objects)} testId="objects" />
    </div>
  )
}

function Reading({
  label,
  value,
  accent,
  testId,
}: {
  label: string
  value: string
  accent?: boolean
  testId?: string
}) {
  return (
    <div className="reading">
      <span className="reading-label">{label}</span>
      <span className={`reading-value mono${accent ? ' accent' : ''}`} data-testid={testId}>
        {value}
      </span>
    </div>
  )
}
