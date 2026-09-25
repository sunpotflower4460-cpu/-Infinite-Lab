import { getController } from '../../app/LabController'
import { getExperiment } from '../../experiments/registry'
import { CONSTANTS } from '../../math/constants'
import { useLab } from '../../state/labStore'
import { formatInt } from '../../utils/format'

/** History (spec §27): saved experiment states in this browser (localStorage). */
export function HistoryPanel() {
  const c = getController()
  const history = useLab((s) => s.history)
  const ready = useLab((s) => s.phase === 'ready')
  return (
    <section data-testid="history">
      <div className="panel-title">History</div>
      <button onClick={() => void c.saveToHistory()} disabled={!ready}>
        Save current state
      </button>
      {history.length === 0 ? (
        <p className="muted small">Saved states stay in this browser only.</p>
      ) : (
        <ul className="history-list">
          {history.map((h) => (
            <li key={h.id}>
              <button
                className="history-restore"
                onClick={() => c.restoreHistory(h.id)}
                title="Restore and re-run"
              >
                <span>
                  {CONSTANTS[h.config.constant]?.symbol} · {getExperiment(h.config.experiment).name}
                </span>
                <span className="muted small mono">
                  {formatInt(h.steps)} steps · {new Date(h.timestamp).toLocaleString()}
                </span>
              </button>
              <button className="history-delete" onClick={() => c.deleteHistory(h.id)} aria-label="Delete">
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
