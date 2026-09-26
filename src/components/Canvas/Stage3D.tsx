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

  useEffect(() => {
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
          look: () => store.getState().look,
          follow: () => store.getState().follow,
          onUserCamera: () => store.setState({ follow: false }),
          onPick: (step) => controller.pickStep(step),
        })
        controller.view3d = scene.current
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
    return () => {
      cancelled = true
      if (controller.view3d === scene.current) controller.view3d = null
      scene.current?.destroy()
      scene.current = null
    }
  }, [controller])

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
