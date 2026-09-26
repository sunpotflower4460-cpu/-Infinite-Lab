import { useEffect, useRef } from 'react'
import { useStore } from 'zustand'
import { getController, type LabController } from '../../app/LabController'
import { ScientificOverlay } from '../Status/ScientificOverlay'
import { LaneReadout } from '../Compare/LaneReadout'
import { FilmOverlay } from '../Film/FilmOverlay'
import { Stage3D } from './Stage3D'
import { EXPERIMENTS } from '../../experiments/registry'
import { TWO_ARM_VIEWS } from '../../experiments/two-arm-3d'

/** The fraction the Two-Arm views compare against (π ≈ 22/7: 15 petals, a closed torus knot). */
const COMPARE_RATIONAL = 'frac-22-7'

/**
 * One canvas lane. The main lab always renders lane 0 in the same place in the tree (so its
 * WebGL canvas is never re-created); Compare Mode adds a second lane next to it.
 */
export function LabCanvas({
  controller = getController(),
  lane = 0,
}: {
  controller?: LabController
  lane?: 0 | 1
}) {
  const host = useRef<HTMLDivElement>(null)
  const follow = useStore(controller.store, (s) => s.follow)
  const phase = useStore(controller.store, (s) => s.phase)
  const compareConstant = useStore(getController().store, (s) => s.compareConstant)
  const comparing = compareConstant !== null
  const film = useStore(controller.store, (s) => s.film)
  const look = useStore(controller.store, (s) => s.look)
  const microscope = useStore(controller.store, (s) => s.microscope)
  const experimentId = useStore(controller.store, (s) => s.experimentId)
  const is3d = EXPERIMENTS[experimentId]?.view === '3d'
  // always offered (not only after the Film has switched to Two-Arm): a click starts that view
  const inFamily = TWO_ARM_VIEWS.some((v) => v.id === experimentId)
  const views = film ? null : TWO_ARM_VIEWS

  useEffect(() => {
    if (host.current) void controller.mount(host.current)
  }, [controller])

  return (
    <div className="stage" data-testid={`lane-${lane}`}>
      <div className="stage-canvas" ref={host} />
      {is3d && <Stage3D controller={controller} />}
      {lane === 0 && <ScientificOverlay />}
      {comparing && <LaneReadout controller={controller} lane={lane} />}
      <div className="stage-tools">
        {views && lane === 0 && (
          <>
            <div className="view-switch" role="group" aria-label="Two-Arm view">
              {views.map((v) => (
                <button
                  key={v.id}
                  className={v.id === experimentId ? 'active' : ''}
                  aria-pressed={v.id === experimentId}
                  onClick={() => v.id !== experimentId && controller.switchView(v.id)}
                  title={EXPERIMENTS[v.id]?.name}
                >
                  {v.label}
                </button>
              ))}
            </div>
            {inFamily && (
              <button
                className={`view-compare ${compareConstant === COMPARE_RATIONAL ? 'active' : ''}`}
                aria-pressed={compareConstant === COMPARE_RATIONAL}
                onClick={() =>
                  compareConstant === COMPARE_RATIONAL
                    ? controller.disableCompare()
                    : controller.enableCompare(COMPARE_RATIONAL)
                }
                title="Run the same machine with the speed ratio 22/7 next to it: the fraction closes, the constant never does"
              >
                vs 22/7
              </button>
            )}
          </>
        )}
        <button
          onClick={() => controller.fitAll()}
          className={follow ? 'active' : ''}
          title="Fit all and follow"
        >
          Fit All
        </button>
        {!is3d && (
          <button onClick={() => controller.center()} title="Center on the structure">
            Center
          </button>
        )}
        <button
          onClick={() => controller.setLook(look === 'lab' ? 'luminous' : 'lab')}
          className={look === 'luminous' ? 'active' : ''}
          title="White glow (the reference video's look); presentation only"
        >
          Glow
        </button>
      </div>
      {lane === 0 && (
        <div className="stage-hint">
          {is3d
            ? 'drag: rotate · right-drag / two fingers: pan · wheel / pinch: zoom · click: inspect · double-click: fit'
            : 'wheel: zoom · drag: pan · double-click: center'}
        </div>
      )}
      {microscope && (
        <div className="stage-microscope" data-testid={`microscope-badge-${lane}`}>
          🔬 steps {microscope.from.toLocaleString('en-US')}–{microscope.to.toLocaleString('en-US')}
          <button onClick={() => controller.clearMicroscope()} aria-label="Exit microscope view">
            ✕
          </button>
        </div>
      )}
      {phase === 'computing' && <div className="stage-busy">computing digits…</div>}
      {lane === 0 && film && <FilmOverlay />}
    </div>
  )
}
