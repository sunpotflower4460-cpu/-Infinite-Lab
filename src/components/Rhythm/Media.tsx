import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { MediumResult } from '../../rhythm/models'
import type { Stage } from '../../workers/rhythm.worker'
import { Tag } from '../Golden/Sections'
import { BEATS, pct, Pick, uColor, useRhythmWorker, useVisible, type BeatId } from './common'

export interface MediumSetup {
  beat: BeatId
  gamma: number
  seed: number
  n: number
}

interface Frame {
  stage: Stage
  progress: number
  periods: number
  drive: number
  field: Float32Array
  vortices: number | null
}

/**
 * A live medium (2D plane or 3D box) under a beat. It runs while it is on screen: first the report's
 * protocol as fast as the device allows (settle 40 own periods, record 45 beats, judge every cell),
 * then slowly, so the beat and the medium can be watched together.
 */
export function LiveMedium({
  dim,
  setup,
  label,
  liveBeat,
  onResult,
}: {
  dim: 2 | 3
  setup: MediumSetup
  label: string
  /** a beat change while running (the heart section): the medium keeps its state */
  liveBeat?: { beat: BeatId; gamma: number } | null
  onResult?: (r: MediumResult | null) => void
}) {
  const box = useRef<HTMLDivElement>(null)
  const visible = useVisible(box, '0px')
  const canvas = useRef<HTMLCanvasElement>(null)
  const [frame, setFrame] = useState<Frame | null>(null)
  const [result, setResult] = useState<MediumResult | null>(null)
  const [tips, setTips] = useState<number | null>(null)
  const report = useRef(onResult)
  report.current = onResult
  const worker = useRhythmWorker((r) => {
    if (r.kind === 'frame') {
      setFrame(r)
      if (r.vortices !== null) setTips(r.vortices)
    } else if (r.kind === 'result') {
      setResult(r.result)
      report.current?.(r.result)
    }
  })
  const key = `${setup.beat}|${setup.gamma}|${setup.seed}|${setup.n}`

  useEffect(() => {
    if (!visible) {
      worker.stop()
      return
    }
    setResult(null)
    setTips(null)
    setFrame(null)
    report.current?.(null)
    const b = BEATS.find((x) => x.id === setup.beat)!
    worker.send({ kind: 'medium', dim, n: setup.n, s: b.w, gamma: setup.gamma, seed: setup.seed })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, key])

  useEffect(() => {
    if (!liveBeat || !visible) return
    setResult(null)
    report.current?.(null)
    worker.send({ kind: 'beat', s: BEATS.find((x) => x.id === liveBeat.beat)!.w, gamma: liveBeat.gamma })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveBeat])

  useEffect(() => {
    const el = canvas.current
    if (!el || !frame) return
    if (dim === 2) drawPlane(el, frame.field, setup.n)
    else drawBox(el, frame.field, setup.n)
  }, [frame, dim, setup.n])

  const stageText = !frame
    ? '準備中…'
    : frame.stage === 'transient'
      ? `早送りで落ち着かせています（自分の周期 ${frame.periods.toFixed(0)} / 40 回）`
      : frame.stage === 'measure'
        ? '拍子 45 回ぶんの動きを記録しています'
        : '測定おわり。いまはゆっくり動かしています'
  const hit = frame ? Math.max(0, frame.drive) ** 8 : 0
  return (
    <div ref={box} className="room-medium">
      <div className="room-medium-view">
        <canvas
          ref={canvas}
          className={`room-canvas room-square ${dim === 2 ? 'room-plane' : ''}`}
          role="img"
          aria-label={label}
        />
        <div
          className="room-drum"
          style={{ opacity: 0.15 + 0.85 * hit * Math.min(1, setup.gamma * 10 + (liveBeat?.gamma ?? 0) * 10) }}
          title="外の拍子"
        >
          拍子
        </div>
      </div>
      <div className="room-progress" aria-label="進み具合">
        <div style={{ width: `${Math.round((frame?.progress ?? 0) * 100)}%` }} />
      </div>
      <div className="small muted" aria-live="polite">
        {stageText}
        {dim === 2 && tips !== null && (
          <>
            ・らせんの中心 <b style={{ color: '#d9def0' }}>{tips}</b> 個 <Tag kind="測定" />
          </>
        )}
      </div>
      {result && (
        <div className="room-verdict" data-guide-state>
          取り込まれた割合 <b>{pct(result.captured)}</b>
          {result.at.length > 0 && `（${result.at.map((a) => `${a.frac} に ${pct(a.share)}`).join('、')}）`}
          ・箱全体のリズム：拍子 1 回に自分が <b>{result.rhoMedian.toFixed(3)}</b> 回
          {dim === 3 && `・渦の線 ${result.vortices}`} <Tag kind="測定" />
        </div>
      )}
    </div>
  )
}

function drawPlane(el: HTMLCanvasElement, u: Float32Array, n: number) {
  if (el.width !== n) {
    el.width = n
    el.height = n
  }
  const ctx = el.getContext('2d')
  if (!ctx) return
  const img = ctx.createImageData(n, n)
  for (let i = 0; i < n * n; i++) {
    const [r, g, b] = uColor(u[i]!)
    img.data[4 * i] = r
    img.data[4 * i + 1] = g
    img.data[4 * i + 2] = b
    img.data[4 * i + 3] = 255
  }
  ctx.putImageData(img, 0, 0)
}

const faceCanvas: HTMLCanvasElement[] = []
/** The box: three faces (front, top, right) as a cube in oblique projection. */
function drawBox(el: HTMLCanvasElement, f: Float32Array, n: number) {
  const ctx = el.getContext('2d')
  if (!ctx) return
  const S = el.clientWidth || 320
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  if (el.width !== Math.round(S * dpr)) {
    el.width = Math.round(S * dpr)
    el.height = Math.round(S * dpr)
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, el.width, el.height)
  const nn = n * n
  for (let k = 0; k < 3; k++) {
    const c = (faceCanvas[k] ??= document.createElement('canvas'))
    c.width = n
    c.height = n
    const fc = c.getContext('2d')
    if (!fc) return
    const img = fc.createImageData(n, n)
    const shade = [1, 1.12, 0.78][k]!
    for (let i = 0; i < nn; i++) {
      const [r, g, b] = uColor(f[k * nn + i]!)
      img.data[4 * i] = Math.min(255, r * shade)
      img.data[4 * i + 1] = Math.min(255, g * shade)
      img.data[4 * i + 2] = Math.min(255, b * shade)
      img.data[4 * i + 3] = 255
    }
    fc.putImageData(img, 0, 0)
  }
  const W = el.width
  const a = W * 0.56 // edge of the front face
  const d = W * 0.26 // depth offset
  const x0 = W * 0.1
  const y0 = W * 0.32
  ctx.imageSmoothingEnabled = true
  // front (y down, x right)
  ctx.setTransform(a / n, 0, 0, a / n, x0, y0)
  ctx.drawImage(faceCanvas[0]!, 0, 0)
  // top (y = 0): columns = x, rows = z from the back (z = 0, shifted up-right) to the front edge
  ctx.setTransform(a / n, 0, -d / n, d / n, x0 + d, y0 - d)
  ctx.drawImage(faceCanvas[1]!, 0, 0)
  // right (x = n−1): columns = y (down), rows = z from the back to the front edge
  ctx.setTransform(0, a / n, -d / n, d / n, x0 + a + d, y0 - d)
  ctx.drawImage(faceCanvas[2]!, 0, 0)
  ctx.setTransform(1, 0, 0, 1, 0, 0)
}

/** Buttons to pick the beat, its strength and the start, shared by the 3D and 2D sections. */
export function MediumControls({
  setup,
  onChange,
  beats,
  gammas,
  seeds,
  sizes,
  extra,
}: {
  setup: MediumSetup
  onChange: (s: MediumSetup) => void
  beats: BeatId[]
  gammas: number[]
  seeds?: { seed: number; label: string }[]
  sizes?: { n: number; label: string }[]
  extra?: ReactNode
}) {
  return (
    <div>
      <div className="small muted">拍子の比 s</div>
      <Pick
        label="拍子の比 s"
        value={setup.beat}
        onPick={(beat) => onChange({ ...setup, beat })}
        options={beats.map((id) => {
          const b = BEATS.find((x) => x.id === id)!
          return { value: id, label: b.label, color: b.color }
        })}
      />
      <div className="small muted">拍子の強さ γ</div>
      <Pick
        label="拍子の強さ γ"
        value={setup.gamma}
        onPick={(gamma) => onChange({ ...setup, gamma })}
        options={gammas.map((g) => ({ value: g, label: g === 0 ? '0（拍子なし）' : String(g) }))}
      />
      {seeds && (
        <>
          <div className="small muted">始め方（まだら模様）</div>
          <Pick
            label="始め方"
            value={setup.seed}
            onPick={(seed) => onChange({ ...setup, seed })}
            options={seeds.map((s) => ({ value: s.seed, label: s.label }))}
          />
        </>
      )}
      {sizes && (
        <>
          <div className="small muted">箱の大きさ</div>
          <Pick
            label="箱の大きさ"
            value={setup.n}
            onPick={(n) => onChange({ ...setup, n })}
            options={sizes.map((s) => ({ value: s.n, label: s.label }))}
          />
        </>
      )}
      {extra}
    </div>
  )
}
