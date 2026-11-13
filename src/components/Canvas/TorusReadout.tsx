import { useStore } from 'zustand'
import type { LabController } from '../../app/LabController'
import { torusKind, type TorusKind } from '../../experiments/two-arm-3d/torus'

const LABELS: Record<TorusKind, string> = {
  ring: 'リング（穴あり）',
  horn: 'ホーン（穴が閉じる）',
  spindle: 'スピンドル（自己交差）',
  sphere: 'R=0：球面へ退化',
  circle: 'r=0：円へ退化',
  point: 'R=r=0：点',
}

/** State-derived labels only; the experiment's Formula AST still supplies every coordinate. */
export function TorusReadout({ controller }: { controller: LabController }) {
  const params = useStore(controller.store, (s) => s.params)
  const R = params.r1 as number,
    r = params.r2 as number,
    scale = params.scale as number
  return (
    <div className="observation-rule" data-testid="torus-readout">
      <div>
        大半径 R={R * scale} / 管半径 r={r * scale} · {LABELS[torusKind(R, r)]}
      </div>
      <div>2Dと回転角は同じ、x・yは変換。調整 → 穴あり／穴なし。点の間は直線です。</div>
    </div>
  )
}
