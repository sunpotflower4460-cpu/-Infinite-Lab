import { useEffect, useRef } from 'react'
import { getController } from '../../app/LabController'
import { useLab } from '../../state/labStore'
import { ScientificOverlay } from '../Status/ScientificOverlay'

export function LabCanvas() {
  const host = useRef<HTMLDivElement>(null)
  const follow = useLab((s) => s.follow)
  const phase = useLab((s) => s.phase)
  const controller = getController()

  useEffect(() => {
    if (host.current) void controller.mount(host.current)
  }, [controller])

  return (
    <div className="stage">
      <div className="stage-canvas" ref={host} />
      <ScientificOverlay />
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
      </div>
      <div className="stage-hint">wheel: zoom · drag: pan · double-click: center</div>
      {phase === 'computing' && <div className="stage-busy">computing digits…</div>}
    </div>
  )
}
