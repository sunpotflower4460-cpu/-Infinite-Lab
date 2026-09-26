import { useEffect, useRef } from 'react'
import { useStore } from 'zustand'
import { getController, type LabController } from '../../app/LabController'
import { ScientificOverlay } from '../Status/ScientificOverlay'
import { LaneReadout } from '../Compare/LaneReadout'
import { FilmOverlay } from '../Film/FilmOverlay'

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
  const comparing = useStore(getController().store, (s) => s.compareConstant !== null)
  const film = useStore(controller.store, (s) => s.film)
  const look = useStore(controller.store, (s) => s.look)
  const microscope = useStore(controller.store, (s) => s.microscope)

  useEffect(() => {
    if (host.current) void controller.mount(host.current)
  }, [controller])

  return (
    <div className="stage" data-testid={`lane-${lane}`}>
      <div className="stage-canvas" ref={host} />
      {lane === 0 && <ScientificOverlay />}
      {comparing && <LaneReadout controller={controller} lane={lane} />}
      <div className="stage-tools">
        <button
          onClick={() => controller.fitAll()}
          className={follow ? 'active' : ''}
          title="Fit all and follow"
        >
          Fit All
        </button>
        <button onClick={() => controller.center()} title="Center on the structure">
          Center
        </button>
        <button
          onClick={() => controller.setLook(look === 'lab' ? 'luminous' : 'lab')}
          className={look === 'luminous' ? 'active' : ''}
          title="White glow (the reference video's look); presentation only"
        >
          Glow
        </button>
      </div>
      {lane === 0 && <div className="stage-hint">wheel: zoom · drag: pan · double-click: center</div>}
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
