import { useEffect } from 'react'
import { getController } from '../../app/LabController'
import { SPEEDS, useLab } from '../../state/labStore'
import { formatInt } from '../../utils/format'
import { Timeline } from '../Timeline/Timeline'

export function Controls() {
  const c = getController()
  const playing = useLab((s) => s.playing)
  const finished = useLab((s) => s.finished)
  const ready = useLab((s) => s.phase === 'ready')
  const speedIndex = useLab((s) => s.speedIndex)
  const continuous = useLab((s) => s.continuous)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
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
          disabled={!ready || (finished && !playing)}
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
        title="Infinite Mode: keep computing more digits until paused (continuous computation, up to 1,000,000 digits)"
      >
        ∞ Infinite
      </button>
      <Timeline />
    </div>
  )
}
