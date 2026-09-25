import { useStore } from 'zustand'
import { getController } from '../../app/LabController'
import { CONSTANTS } from '../../math/constants'

/** Topbar switch for Compare Mode (spec §26). */
export function CompareToggle() {
  const c = getController()
  const on = useStore(c.store, (s) => s.compareConstant !== null)
  const constantId = useStore(c.store, (s) => s.constantId)
  const ready = useStore(c.store, (s) => s.phase === 'ready')
  return (
    <button
      className={on ? 'active' : ''}
      aria-pressed={on}
      disabled={!ready && !on}
      onClick={() => {
        if (on) c.disableCompare()
        else c.enableCompare(Object.keys(CONSTANTS).find((id) => id !== constantId) ?? 'e')
      }}
      title="Run the same experiment with another constant, side by side, in lockstep"
    >
      Compare
    </button>
  )
}
