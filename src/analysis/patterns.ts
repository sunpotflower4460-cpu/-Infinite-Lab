import { KIND } from '../geometry/batch'
import type { GeometryStore } from '../geometry/GeometryStore'

/**
 * Pattern Detection (spec §38): deterministic *measurements* of the geometry shown so far.
 * Everything here is computed, not guessed; the AI Observer receives these as facts.
 */
export interface PatternFacts {
  records: number
  steps: number
  bounds: { minX: number; minY: number; maxX: number; maxY: number } | null
  /** Mean of the anchor points (circle/point centres and line end points). */
  centroid: { x: number; y: number }
  /** Root-mean-square distance of anchors from the centroid. */
  radiusOfGyration: number
  /** Largest distance of an anchor from the centroid. */
  maxRadius: number
  /**
   * Rotational symmetry of the *drawn picture* around the centroid: the drawing (lines and
   * circles) is rasterised, the brightness in the band 25–60 % of maxRadius is taken as a
   * function of angle, and its Fourier amplitudes |F_k| / F_0 are reported (k = 1…40).
   * `significant` = order ≥ 3, amplitude ≥ 0.05 and ≥ 3 × the median amplitude of all orders.
   * (Orders 1 and 2 describe an off-centre or elongated shape, not a rotational symmetry.)
   */
  symmetry: { order: number; strength: number; significant: boolean }[]
  /** Median |F_k| / F_0 over k = 1…40 (the background level for `symmetry`). */
  symmetryBackground: number
  /** Steps whose anchor comes back within `returnTolerance` of the first anchor (up to 5). */
  nearReturns: { step: number; distance: number }[]
  returnTolerance: number
  /** Digit frequencies among the consumed digits and Pearson's χ² against uniform (9 degrees of freedom). */
  digits: { counts: number[]; chiSquare: number } | null
}

const MAX_ORDER = 40

/** Anchor point of each record: centre for circles/points/arcs, end point for lines. */
function anchor(d: Float64Array, o: number): [number, number] {
  return d[o] === KIND.line ? [d[o + 4]!, d[o + 5]!] : [d[o + 2]!, d[o + 3]!]
}

export function detectPatterns(
  store: GeometryStore,
  count: number,
  consumedDigits?: ArrayLike<number>,
): PatternFacts {
  const n = Math.min(count, store.count)
  let sx = 0
  let sy = 0
  let steps = 0
  store.forEachRecord(n, (d, o) => {
    const [x, y] = anchor(d, o)
    sx += x
    sy += y
    steps = d[o + 1]!
  })
  const cx = n ? sx / n : 0
  const cy = n ? sy / n : 0

  let s2 = 0
  let maxR = 0
  let first: [number, number] | null = null
  let firstStep = 0
  let lastStepSeen = -1
  const candidates: { step: number; distance: number }[] = []
  const extent = store.bounds
    ? Math.max(store.bounds.maxX - store.bounds.minX, store.bounds.maxY - store.bounds.minY)
    : 0
  const tol = extent * 0.005
  store.forEachRecord(n, (d, o) => {
    const [x, y] = anchor(d, o)
    const dx = x - cx
    const dy = y - cy
    const r2 = dx * dx + dy * dy
    s2 += r2
    if (r2 > maxR * maxR) maxR = Math.sqrt(r2)
    const step = d[o + 1]!
    if (step === lastStepSeen) return // one anchor per step for returns (the last record of the step wins below)
    lastStepSeen = step
    if (!first) {
      first = [x, y]
      firstStep = step
    } else if (step > firstStep + 1) {
      const dist = Math.hypot(x - first[0], y - first[1])
      if (dist <= tol && candidates.length < 5) candidates.push({ step, distance: dist })
    }
  })

  const { symmetry, background } = pictureSymmetry(store, n, cx, cy, maxR)

  let digits: PatternFacts['digits'] = null
  if (consumedDigits && consumedDigits.length > 0) {
    const counts = new Array<number>(10).fill(0)
    for (let i = 0; i < consumedDigits.length; i++) counts[consumedDigits[i]!]!++
    const expected = consumedDigits.length / 10
    const chiSquare = counts.reduce((a, c) => a + ((c - expected) * (c - expected)) / expected, 0)
    digits = { counts, chiSquare }
  }

  return {
    records: n,
    steps,
    bounds: n ? store.boundsUpTo(n) : null,
    centroid: { x: cx, y: cy },
    radiusOfGyration: n ? Math.sqrt(s2 / n) : 0,
    maxRadius: maxR,
    symmetry: symmetry.slice(0, 5),
    symmetryBackground: background,
    nearReturns: candidates,
    returnTolerance: tol,
    digits,
  }
}

const GRID = 512
const ANGLE_BINS = 360

/** Angular Fourier spectrum of the rasterised drawing in the band 25–60 % of `radius` around (cx, cy). */
function pictureSymmetry(
  store: GeometryStore,
  n: number,
  cx: number,
  cy: number,
  radius: number,
): { symmetry: PatternFacts['symmetry']; background: number } {
  const empty = { symmetry: [], background: 0 }
  if (n === 0 || radius <= 0) return empty
  const grid = new Float32Array(GRID * GRID)
  const scale = (GRID / 2 - 1) / radius
  const plot = (x: number, y: number) => {
    const gx = Math.round((x - cx) * scale + GRID / 2)
    const gy = Math.round((y - cy) * scale + GRID / 2)
    if (gx >= 0 && gy >= 0 && gx < GRID && gy < GRID) grid[gy * GRID + gx] = 1 // presence, not count
  }
  const segment = (x1: number, y1: number, x2: number, y2: number) => {
    const steps = Math.max(1, Math.ceil(Math.hypot(x2 - x1, y2 - y1) * scale))
    for (let i = 0; i <= steps; i++) plot(x1 + ((x2 - x1) * i) / steps, y1 + ((y2 - y1) * i) / steps)
  }
  store.forEachRecord(n, (d, o) => {
    const kind = d[o]
    if (kind === KIND.line) segment(d[o + 2]!, d[o + 3]!, d[o + 4]!, d[o + 5]!)
    else if (kind === KIND.point || d[o + 4]! <= 0) plot(d[o + 2]!, d[o + 3]!)
    else {
      const r = d[o + 4]!
      const start = kind === KIND.arc ? d[o + 5]! : 0
      const sweep = kind === KIND.arc ? d[o + 6]! : 2 * Math.PI
      const steps = Math.max(8, Math.ceil(sweep * r * scale))
      for (let i = 0; i <= steps; i++) {
        const a = start + (sweep * i) / steps
        plot(d[o + 2]! + r * Math.cos(a), d[o + 3]! + r * Math.sin(a))
      }
    }
  })
  const profile = new Float64Array(ANGLE_BINS)
  const counts = new Float64Array(ANGLE_BINS)
  const r0 = 0.25 * (GRID / 2)
  const r1 = 0.6 * (GRID / 2)
  for (let gy = 0; gy < GRID; gy++) {
    for (let gx = 0; gx < GRID; gx++) {
      const dx = gx - GRID / 2
      const dy = gy - GRID / 2
      const rr = Math.hypot(dx, dy)
      if (rr < r0 || rr > r1) continue
      const bin = Math.floor(((Math.atan2(dy, dx) + Math.PI) / (2 * Math.PI)) * ANGLE_BINS) % ANGLE_BINS
      profile[bin]! += grid[gy * GRID + gx]!
      counts[bin]!++
    }
  }
  let f0 = 0
  for (let b = 0; b < ANGLE_BINS; b++) {
    profile[b] = counts[b]! ? profile[b]! / counts[b]! : 0
    f0 += profile[b]!
  }
  if (f0 === 0) return empty
  const amps: { order: number; strength: number }[] = []
  for (let k = 1; k <= MAX_ORDER; k++) {
    let re = 0
    let im = 0
    for (let b = 0; b < ANGLE_BINS; b++) {
      const a = (2 * Math.PI * k * b) / ANGLE_BINS
      re += profile[b]! * Math.cos(a)
      im += profile[b]! * Math.sin(a)
    }
    amps.push({ order: k, strength: Math.hypot(re, im) / f0 })
  }
  const sorted = amps.map((a) => a.strength).sort((a, b) => a - b)
  const background = (sorted[19]! + sorted[20]!) / 2
  amps.sort((a, b) => b.strength - a.strength || a.order - b.order)
  return {
    symmetry: amps.map((a) => ({
      ...a,
      significant: a.order >= 3 && a.strength >= 0.05 && a.strength >= 3 * background,
    })),
    background,
  }
}
