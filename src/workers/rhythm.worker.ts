/// <reference lib="webworker" />
import {
  bump,
  circlesWithStart,
  isCircle,
  rotation,
  Medium,
  MEDIUM_BEATS,
  MEDIUM_TRANSIENT,
  T0,
  type MediumResult,
} from '../rhythm/models'

/**
 * The textbook's heavy computations, off the page's thread:
 *  - `medium`: a 2D / 3D medium under a beat, measured with the report's protocol (fast), then shown
 *    slowly so the beat and the medium can be watched together. Frames are posted as it goes.
 *  - `circles`: the report's scan of the standard map at one K.
 *  - `barcode`: the same scan over a list of K, one column at a time.
 */

export type RhythmRequest =
  | { kind: 'medium'; dim: 2 | 3; n: number; s: number; gamma: number; seed: number }
  | { kind: 'beat'; s: number; gamma: number } // change the beat of the running medium, keep its state
  | { kind: 'speed'; periodsPerSecond: number }
  | { kind: 'circles'; K: number; n?: number; N?: number }
  | { kind: 'barcode'; Ks: number[]; n: number; N: number }
  | { kind: 'stop' }

export type Stage = 'transient' | 'measure' | 'watch'

export type RhythmReply =
  | {
      kind: 'frame'
      stage: Stage
      /** 0..1 through the measurement protocol */
      progress: number
      t: number
      /** time in own periods since the last start or beat change */
      periods: number
      drive: number
      /** 2D: u of every cell; 3D: three faces (front z = n−1, top y = 0, right x = n−1), n² each */
      field: Float32Array
      vortices: number | null
    }
  | { kind: 'result'; result: MediumResult; s: number; gamma: number }
  | { kind: 'circles'; K: number; circles: { p0: number; w: number }[] }
  | { kind: 'column'; K: number; index: number; circles: { p0: number; w: number }[] }

const ctx = self as unknown as DedicatedWorkerGlobalScope
let run = 0
let scanRun = 0
const weightCache = new Map<number, Float64Array>()
const weights = (N: number) => {
  let w = weightCache.get(N)
  if (!w) weightCache.set(N, (w = bump(N)))
  return w
}
let medium: Medium | null = null
let periodsPerSecond = 0.35
let since = 0

ctx.onmessage = (e: MessageEvent<RhythmRequest>) => {
  const m = e.data
  if (m.kind === 'stop') {
    run++
    medium = null
    return
  }
  if (m.kind === 'speed') {
    periodsPerSecond = m.periodsPerSecond
    return
  }
  if (m.kind === 'beat') {
    if (!medium) return
    medium.setBeat(m.s, m.gamma)
    since = medium.t
    medium.measureFrom(medium.t + MEDIUM_TRANSIENT * T0, MEDIUM_BEATS)
    return
  }
  if (m.kind === 'circles') {
    // in chunks, so a newer K (a slider being dragged) replaces a scan that is still running
    const id = ++scanRun
    const n = m.n ?? 4001
    const N = m.N ?? 20000
    const w = weights(N)
    const p0 = Float64Array.from({ length: n }, (_, i) => i / (n - 1))
    const keep: { p0: number; w: number }[] = []
    let i = 0
    const next = () => {
      if (id !== scanRun) return
      const end = Math.min(n, i + 200)
      const r = rotation(m.K, p0.subarray(i, end), N, 0, w)
      for (let j = 0; j < end - i; j++)
        if (isCircle(r.w[j]!, r.err[j]!)) keep.push({ p0: p0[i + j]!, w: r.w[j]! })
      i = end
      if (i < n) setTimeout(next, 0)
      else
        ctx.postMessage({
          kind: 'circles',
          K: m.K,
          circles: keep.sort((a, b) => a.w - b.w),
        } satisfies RhythmReply)
    }
    next()
    return
  }
  if (m.kind === 'barcode') {
    const id = ++run
    const w = weights(m.N)
    let i = 0
    const next = () => {
      if (id !== run || i >= m.Ks.length) return
      const K = m.Ks[i]!
      ctx.postMessage({
        kind: 'column',
        K,
        index: i,
        circles: circlesWithStart(K, m.n, m.N, 1e-9, w),
      } satisfies RhythmReply)
      i++
      setTimeout(next, 0)
    }
    next()
    return
  }
  // a new medium
  const id = ++run
  medium = new Medium(m.n, m.dim, m.s, m.gamma, m.seed)
  since = 0
  medium.measureFrom(MEDIUM_TRANSIENT * T0, MEDIUM_BEATS)
  const md = medium
  let reported = false
  let lastFrame = 0
  let lastVort = 0
  const stepsPerPeriod = T0 / 0.02
  const loop = () => {
    if (id !== run) return
    const now = performance.now()
    if (!md.measured) {
      // as fast as possible, but let a frame out every ~80 ms
      const until = now + 70
      while (performance.now() < until && !md.measured) md.step(md.dim === 3 ? 4 : 20)
    } else {
      if (!reported) {
        reported = true
        ctx.postMessage({
          kind: 'result',
          result: md.result(),
          s: md.s,
          gamma: md.gamma,
        } satisfies RhythmReply)
      }
      md.step(Math.max(1, Math.round((stepsPerPeriod * periodsPerSecond) / 30)))
    }
    const t = performance.now()
    if (t - lastFrame > (md.measured ? 30 : 80)) {
      lastFrame = t
      let vortices: number | null = null
      if (md.dim === 2 && t - lastVort > 400) {
        lastVort = t
        vortices = md.vortices()
      }
      const total = md.tStartTime + MEDIUM_BEATS * md.Tf - since
      const stage: Stage = md.measured ? 'watch' : md.t < md.tStartTime ? 'transient' : 'measure'
      const field = frame(md)
      ctx.postMessage(
        {
          kind: 'frame',
          stage,
          progress: md.measured ? 1 : Math.min(1, (md.t - since) / total),
          t: md.t,
          periods: (md.t - since) / T0,
          drive: md.drive,
          field,
          vortices,
        } satisfies RhythmReply,
        [field.buffer],
      )
    }
    setTimeout(loop, md.measured ? 16 : 0)
  }
  // a beat change sets `measured` false again; report its result as well
  const watch = () => {
    if (id !== run) return
    if (!md.measured) reported = false
    setTimeout(watch, 50)
  }
  watch()
  loop()
}

function frame(m: Medium): Float32Array {
  const n = m.n
  if (m.dim === 2) return Float32Array.from(m.u)
  const out = new Float32Array(3 * n * n)
  const nn = n * n
  for (let a = 0; a < n; a++)
    for (let b = 0; b < n; b++) {
      out[a * n + b] = m.u[(n - 1) * nn + a * n + b]! // front: z = n−1, (y, x)
      out[nn + a * n + b] = m.u[a * nn + 0 * n + b]! // top: y = 0, (z, x)
      out[2 * nn + a * n + b] = m.u[a * nn + b * n + (n - 1)]! // right: x = n−1, (z, y)
    }
  return out
}
