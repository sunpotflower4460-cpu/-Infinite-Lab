import { useLab } from '../../state/labStore'
import { ordinal } from '../../utils/format'

const BEFORE = 36
const AFTER = 36

/** The constant's digit string with the digit consumed by the current step highlighted. */
export function DigitStream() {
  const constant = useLab((s) => s.constant)
  // Follows the Timeline when looking at the past, otherwise the running step.
  const trace = useLab((s) => (s.viewStep !== null ? (s.inspected ?? s.currentTrace) : s.currentTrace))
  if (!constant) return <div className="digit-stream mono muted">computing…</div>

  const digits = constant.digits
  const ipl = constant.integerPartLength
  const pos = trace?.digitPosition ?? -1
  const center = pos >= 0 ? pos : 0
  const from = Math.max(0, center - BEFORE)
  const to = Math.min(digits.length, center + AFTER + 1)

  const cells = []
  if (from > 0)
    cells.push(
      <span key="pre" className="muted">
        …
      </span>,
    )
  for (let i = from; i < to; i++) {
    if (i === ipl) cells.push(<span key="dot">.</span>)
    cells.push(
      <span key={i} className={i === pos ? 'digit current' : i < pos ? 'digit consumed' : 'digit'}>
        {digits[i]}
      </span>,
    )
  }
  if (to < digits.length)
    cells.push(
      <span key="post" className="muted">
        …
      </span>,
    )

  const place = trace
    ? trace.digitPlace === 'integer'
      ? 'integer part'
      : `${ordinal(trace.digitPlace)} decimal place`
    : null

  return (
    <div className="digit-stream" data-testid="digit-stream">
      <span className="constant-symbol">{constant.symbol}</span>
      <span className="mono digits">{cells}</span>
      <span className="digit-place muted">{place ? `↑ ${place}` : 'press ▶ to start reading digits'}</span>
    </div>
  )
}
