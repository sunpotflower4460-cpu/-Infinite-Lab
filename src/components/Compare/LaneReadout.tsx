import { useStore } from 'zustand'
import { getController, type LabController } from '../../app/LabController'
import { CONSTANTS } from '../../math/constants'
import { formatExact, formatInt } from '../../utils/format'

/** Compare Mode: what each lane is computing right now (or at the inspected step). */
export function LaneReadout({ controller, lane }: { controller: LabController; lane: 0 | 1 }) {
  const main = getController()
  const constant = useStore(controller.store, (s) => s.constant)
  const constantId = useStore(controller.store, (s) => s.constantId)
  const step = useStore(controller.store, (s) => s.currentStep)
  const trace = useStore(controller.store, (s) => s.inspected ?? s.currentTrace)
  const otherId = useStore(main.store, (s) => (lane === 0 ? s.compareConstant : s.constantId))

  return (
    <div className="lane-readout" data-testid={`lane-readout-${lane}`}>
      <div className="lane-head">
        {lane === 1 ? (
          <select
            value={constantId}
            onChange={(e) => main.enableCompare(e.target.value)}
            aria-label="Compare constant"
          >
            {Object.values(CONSTANTS).map((c) => (
              <option key={c.id} value={c.id} disabled={c.id === otherId}>
                {c.symbol} — {c.name}
              </option>
            ))}
          </select>
        ) : (
          <span className="lane-symbol">{constant?.symbol ?? CONSTANTS[constantId]?.symbol}</span>
        )}
        <span className="mono muted">step {formatInt(step)}</span>
      </div>
      {trace && (
        <div className="lane-trace mono">
          <div>
            STEP {formatInt(trace.step)} · DIGIT <span className="accent">{trace.digit}</span>
          </div>
          {trace.evaluations.map((ev) => (
            <div key={ev.target} className="lane-eval">
              {ev.target} = {ev.substituted} = {formatExact(ev.value)}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
