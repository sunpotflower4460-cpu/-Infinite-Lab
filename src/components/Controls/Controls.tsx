import { useRoom } from '../../golden/room'
import { useEffect } from 'react'
import { useStore } from 'zustand'
import { getController } from '../../app/LabController'
import { SPEEDS, useLab } from '../../state/labStore'
import { formatInt } from '../../utils/format'
import { Timeline } from '../Timeline/Timeline'

export function Controls() {
  const c = getController()
  const playing = useLab((s) => s.playing || s.lockstepPlaying)
  const comparing = useLab((s) => s.compareConstant !== null)
  // Compare Mode plays both lanes in lockstep: wait until the second lane is ready too
  const peerStore = comparing ? c.peer?.store : undefined
  // re-render when the second lane changes; the rule itself lives in LabController.canPlay()
  useStore(peerStore ?? c.store, (s) => `${s.phase}:${s.currentStep}:${s.totalSteps}`)
  const finished = useLab((s) => s.finished)
  const ready = useLab((s) => s.phase === 'ready')
  const speedIndex = useLab((s) => s.speedIndex)
  const continuous = useLab((s) => s.continuous)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (useRoom.getState().open) return // the room covers the lab: its keys are the page's (scroll)
      const t = e.target
      if (t instanceof HTMLInputElement || t instanceof HTMLSelectElement) return
      // A focused button already reacts to Space/Enter itself; don't toggle twice.
      if (t instanceof HTMLButtonElement && (e.code === 'Space' || e.code === 'Enter')) return
      if (e.code === 'Space') {
        e.preventDefault()
        c.togglePlay()
      } else if (e.code === 'ArrowRight') c.step(1)
      else if (e.key === 'r' || e.key === 'R') c.reset()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [c])

  return (
    <div className="controls">
      <div className="transport">
        <button onClick={() => c.reset()} disabled={!ready} title="Reset (R)" aria-label="Reset">
          ⏮
        </button>
        <button
          className="primary"
          onClick={() => c.togglePlay()}
          disabled={!playing && !c.canPlay()}
          title="Play / Pause (Space)"
          aria-label={playing ? 'Pause' : 'Play'}
        >
          {playing ? '⏸' : '▶'}
        </button>
        <button onClick={() => c.step(1)} disabled={!ready || finished} title="Step (→)" aria-label="Step">
          ⏭
        </button>
      </div>
      <div className="speeds" role="radiogroup" aria-label="Speed">
        {SPEEDS.map((s, i) => (
          <button
            key={s.label}
            role="radio"
            aria-checked={i === speedIndex}
            className={i === speedIndex ? 'active' : ''}
            onClick={() => c.setSpeed(i)}
            title={
              Number.isFinite(s.stepsPerSecond)
                ? `${formatInt(s.stepsPerSecond)} steps/s`
                : 'as fast as possible'
            }
          >
            {s.label}
          </button>
        ))}
      </div>
      <button
        className={`infinite${continuous ? ' active' : ''}`}
        aria-pressed={continuous}
        onClick={() => c.setContinuous(!continuous)}
        disabled={comparing}
        title="Infinite Mode: keep computing more digits until paused (continuous computation, up to 1,000,000 digits)"
      >
        ∞ Infinite
      </button>
      <Timeline />
    </div>
  )
}
