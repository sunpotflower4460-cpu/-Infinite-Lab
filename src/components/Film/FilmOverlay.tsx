import { getController } from '../../app/LabController'
import { useLab } from '../../state/labStore'

/**
 * Film mode overlay: the picture fills the screen; a tap pauses / resumes. The caption states
 * the rule and the drawing time T = n·dt, so the film never pretends to be anything else.
 */
export function FilmOverlay() {
  const c = getController()
  const step = useLab((s) => s.currentStep)
  const dt = useLab((s) => (typeof s.params.dt === 'number' ? s.params.dt : 0))
  const playing = useLab((s) => s.playing)
  const phase = useLab((s) => s.phase)
  const finished = useLab((s) => s.finished)
  const symbol = useLab((s) => s.constant?.symbol ?? 'π')
  return (
    <div className="film-overlay" data-testid="film">
      <button
        className="film-tap"
        aria-label={playing ? 'Pause film' : 'Play film'}
        onClick={() => c.toggleFilm()}
      />
      <div className="film-caption">
        <div className="film-title">
          e<sup>it</sup> + e<sup>i{symbol}t</sup>
        </div>
        <div className="mono" data-testid="film-time">
          T = {(step * dt).toFixed(2)}
        </div>
        <div className="film-hint">
          {phase === 'computing'
            ? 'computing digits…'
            : finished
              ? 'end of the computed digits'
              : playing
                ? 'tap to pause'
                : 'tap to play'}
        </div>
      </div>
      <button className="film-close" onClick={() => c.stopFilm()} aria-label="Close film">
        ✕
      </button>
    </div>
  )
}
