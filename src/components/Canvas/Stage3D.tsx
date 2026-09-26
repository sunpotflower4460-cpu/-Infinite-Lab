import { useEffect, useRef, useState } from 'react'
import type { LabController } from '../../app/LabController'
import type { Scene3D } from '../../renderer/Scene3D'

/**
 * The 3D view of a lane, laid over its 2D canvas while a 3D experiment runs. It reads the same
 * geometry store (and Timeline / Microscope / inspection state) as the 2D view; three.js is
 * loaded only when a 3D experiment is first opened.
 */
export function Stage3D({ controller }: { controller: LabController }) {
  const host = useRef<HTMLDivElement>(null)
  const scene = useRef<Scene3D | null>(null)
  const [rotating, setRotating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [webgl] = useState(webglAvailable)

  useEffect(() => {
    if (!webgl) return // the 2D canvas underneath stays visible: the top view (x, y)
    let cancelled = false
    void import('../../renderer/Scene3D')
      .then(({ Scene3D }) => {
        if (cancelled || !host.current) return
        const store = controller.store
        scene.current = new Scene3D(host.current, {
          store: controller.renderer.store,
          visibleRecords: () => controller.renderer.visibleRecords,
          range: () => store.getState().microscope,
          markedStep: () => {
            const s = store.getState()
            return (s.inspected ?? s.currentTrace)?.step ?? null
          },
          guide: () => {
            const s = store.getState()
            return (s.inspected ?? s.currentTrace)?.overlay ?? null
          },
          look: () => store.getState().look,
          extent: () => controller.extent(),
          follow: () => store.getState().follow,
          onUserCamera: () => store.setState({ follow: false }),
          onPick: (step) => controller.pickStep(step),
        })
        controller.view3d = scene.current
        controller.renderer.suspended = true // the 2D canvas underneath is covered: do not draw it
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
    return () => {
      cancelled = true
      if (controller.view3d === scene.current) controller.view3d = null
      controller.renderer.suspended = false
      scene.current?.destroy()
      scene.current = null
    }
  }, [controller, webgl])

  if (!webgl)
    return (
      <div className="stage-3d-notice" data-testid="webgl-missing" role="note">
        The 3D view needs WebGL, which this browser has turned off or does not support. Shown here: the same
        points seen from above (x, y). The data, Inspector and exports include z.
      </div>
    )

  return (
    <div className="stage-3d" data-testid="stage-3d">
      <div className="stage-3d-canvas" ref={host} />
      {error && <div className="stage-busy">3D view unavailable: {error}</div>}
      <button
        className={`stage-3d-rotate ${rotating ? 'active' : ''}`}
        onClick={() => {
          scene.current?.setAutoRotate(!rotating)
          setRotating(!rotating)
        }}
        title="Turn the view slowly around the vertical axis"
      >
        ⟳ Rotate
      </button>
    </div>
  )
}

/** Whether this browser can create a WebGL context (three.js needs one; 2D has fallbacks). */
function webglAvailable(): boolean {
  try {
    const c = document.createElement('canvas')
    return !!(c.getContext('webgl2') ?? c.getContext('webgl'))
  } catch {
    return false
  }
}
