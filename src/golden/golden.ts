import { computePhi } from '../math/constants/phi'
import { computePi } from '../math/constants/pi'
import { detCos, detSin } from '../math/detmath'
import { pow10 } from '../math/precision/bigint'

/**
 * The mathematics behind the "φ and π" room: every number the room shows is computed here,
 * deterministically (detSin / detCos, BigInt where exactness matters). Nothing is hard-coded
 * except where noted as a literature value.
 */

export const PHI = (1 + Math.sqrt(5)) / 2 // sqrt is correctly rounded in IEEE-754
export const TAU = 2 * Math.PI

// ---- high-precision values ---------------------------------------------------------------

/** "3.14159…" / "1.61803…" with `decimals` certified digits (truncated). */
export const piText = (decimals: number) => computePi(decimals).value
export const phiText = (decimals: number) => computePhi(decimals).value

// ---- 1. pentagon ---------------------------------------------------------------------------

/** Vertices of the regular pentagon with circumradius 1 (first vertex at the top). */
export function pentagon(): [number, number][] {
  return Array.from({ length: 5 }, (_, k) => {
    const a = Math.PI / 2 + (k * 2 * Math.PI) / 5
    return [detCos(a), detSin(a)] as [number, number]
  })
}

/** Side, diagonal and their ratio, measured on the drawn pentagon; and 2·cos(π/5). */
export function pentagonRatio() {
  const v = pentagon()
  const side = Math.hypot(v[1]![0] - v[0]![0], v[1]![1] - v[0]![1])
  const diagonal = Math.hypot(v[2]![0] - v[0]![0], v[2]![1] - v[0]![1])
  return { side, diagonal, ratio: diagonal / side, twoCos: 2 * detCos(Math.PI / 5) }
}

// ---- 2. golden angle -----------------------------------------------------------------------

/** 360° / φ² = 360° − 360°/φ ≈ 137.5078°: the smaller part of a turn divided in the golden ratio. */
export const GOLDEN_ANGLE_DEG = 360 / (PHI * PHI)

/** Seed k of a sunflower (Vogel's model): turn by `angleDeg` per seed, radius ∝ √k. */
export function seeds(count: number, angleDeg: number): [number, number][] {
  return Array.from({ length: count }, (_, i) => {
    const k = i + 1
    const r = Math.sqrt(k / count)
    // (k × a) reduced to one turn first, so large k do not lose precision
    const t = ((k * angleDeg) % 360) * (Math.PI / 180)
    return [r * detCos(t), r * detSin(t)] as [number, number]
  })
}

/**
 * Fractions p/q close to x (0 < x < 1), from its continued fraction in float64: the arms of a
 * sunflower drawn with a turn of x per seed follow these denominators. Stops at `count` or when
 * the fraction is already within float64 of x.
 */
export function nearFractions(x: number, count: number): { p: number; q: number }[] {
  const out: { p: number; q: number }[] = []
  let [p0, q0, p1, q1] = [1, 0, 0, 1]
  let r = x
  for (let i = 0; i < count + 1; i++) {
    const a = Math.floor(r)
    ;[p0, p1] = [a * p0 + p1, p0]
    ;[q0, q1] = [a * q0 + q1, q0]
    if (q0 > 0 && p0 > 0) out.push({ p: p0, q: q0 })
    const f = r - a
    if (f < 1e-9 || out.length >= count) break
    r = 1 / f
  }
  return out
}

// ---- 3. continued fractions ----------------------------------------------------------------

export interface Convergent {
  p: bigint
  q: bigint
  /** |x − p/q| (from the high-precision value, as a float) */
  error: number
  /** q² · |x − p/q|: how close compared with what a denominator q can do (small = unusually close) */
  scaled: number
}

/**
 * Continued fraction terms and convergents of a number given by its decimal digits.
 * The digits are exact (certified), so the first terms are exact as long as the convergents'
 * denominators stay far below 10^(decimals/2); `count` terms are checked against that.
 */
export function continuedFraction(
  digits: string,
  integerPartLength: number,
  count: number,
): { terms: number[]; convergents: Convergent[] } {
  const decimals = digits.length - integerPartLength
  const X = BigInt(digits) // x = X / 10^decimals
  const D = pow10(decimals)
  const terms: number[] = []
  const convergents: Convergent[] = []
  let [num, den] = [X, D]
  let [p0, q0, p1, q1] = [1n, 0n, 0n, 1n]
  for (let i = 0; i < count && den !== 0n; i++) {
    const a = num / den
    terms.push(Number(a))
    ;[p0, p1] = [a * p0 + p1, p0]
    ;[q0, q1] = [a * q0 + q1, q0]
    // |x − p/q| = |X·q − p·D| / (D·q), kept exact until the final division
    const diff = X * q0 - p0 * D
    const absDiff = diff < 0n ? -diff : diff
    const error = ratio(absDiff, D * q0)
    convergents.push({ p: p0, q: q0, error, scaled: error * Number(q0) * Number(q0) })
    ;[num, den] = [den, num - a * den]
    if (q0 * q0 * 1000n > D) break // beyond this the truncated digits could change the terms
  }
  return { terms, convergents }
}

/** a / b as a float for huge BigInts: each keeps its own top 60 bits, so a tiny a loses nothing. */
function ratio(a: bigint, b: bigint): number {
  if (a === 0n) return 0
  const sa = Math.max(0, a.toString(2).length - 60)
  const sb = Math.max(0, b.toString(2).length - 60)
  return (Number(a >> BigInt(sa)) / Number(b >> BigInt(sb))) * 2 ** (sa - sb)
}

// ---- 4. filling a torus ----------------------------------------------------------------------

/**
 * The flat torus (the square with opposite edges glued): the line x = t, y = a·t (mod 1).
 * On the two-arm torus, x is arm 1's turn and y arm 2's, so a is the speed ratio.
 * Returns, for each whole turn 0…turns, the fraction of the N×N cells the line has passed
 * through — exactly: each straight piece is walked cell by cell (grid traversal), so a cell the
 * line only clips at a corner is counted too.
 */
export function coverageByTurn(a: number, turns: number, N = 100): number[] {
  const seen = new Uint8Array(N * N)
  const frac = a - Math.floor(a)
  const out = [0]
  let count = 0
  const mark = (ix: number, iy: number) => {
    const c = Math.min(N - 1, iy) * N + Math.min(N - 1, ix)
    if (!seen[c]) {
      seen[c] = 1
      count++
    }
  }
  // the straight piece from (x0, y0) to (x1, y1), 0 ≤ x0 < x1 ≤ 1, 0 ≤ y0 ≤ y1 ≤ 1
  const piece = (x0: number, y0: number, x1: number, y1: number) => {
    const dx = x1 - x0
    const dy = y1 - y0
    let ix = Math.min(N - 1, Math.floor(x0 * N))
    let iy = Math.min(N - 1, Math.floor(y0 * N))
    const dtx = 1 / (N * dx)
    const dty = dy > 0 ? 1 / (N * dy) : Infinity
    let tx = ((ix + 1) / N - x0) / dx
    let ty = dy > 0 ? ((iy + 1) / N - y0) / dy : Infinity
    for (;;) {
      mark(ix, iy)
      const next = Math.min(tx, ty)
      if (next >= 1 || ix >= N || iy >= N) break
      if (tx <= ty) {
        ix++
        tx += dtx
      }
      if (ty <= next) {
        iy++
        ty += dty
      }
    }
  }
  for (let turn = 0; turn < turns; turn++) {
    const y0 = (frac * turn) % 1 // height where this turn starts (whole turns reduced first)
    const xWrap = frac > 0 ? (1 - y0) / frac : Infinity // where the line leaves through the top
    if (xWrap >= 1) piece(0, y0, 1, y0 + frac)
    else {
      piece(0, y0, xWrap, 1)
      piece(xWrap, 0, 1, frac * (1 - xWrap))
    }
    out.push(count / (N * N))
  }
  return out
}

// ---- 5. KAM: the standard map --------------------------------------------------------------------

/**
 * Chirikov's standard map, a kicked rotor: p' = p + K·sin θ, θ' = θ + p'. For K = 0 every
 * horizontal line is an invariant circle (a "torus"), turning with rotation number p/2π.
 * As K grows the circles break, those with rotation numbers close to fractions first.
 */
export function step(K: number, th: number, p: number): [number, number] {
  const p2 = p + K * detSin(th)
  return [th + p2, p2]
}

const wrap = (x: number) => {
  const r = x % TAU
  return r < 0 ? r + TAU : r
}

/** Points (θ, p) of an orbit, both reduced to [0, 2π). */
export function orbit(K: number, th0: number, p0: number, n: number): Float32Array {
  const out = new Float32Array(2 * n)
  let th = th0
  let p = p0
  for (let i = 0; i < n; i++) {
    ;[th, p] = step(K, th, p)
    th = wrap(th)
    out[2 * i] = th
    out[2 * i + 1] = wrap(p)
  }
  return out
}

/** Mean turn per iteration (θ unwrapped / 2π per step). */
export function rotationNumber(K: number, p0: number, n = 3000, th0 = 0): number {
  let th = th0
  let p = p0
  let total = 0
  for (let i = 0; i < n; i++) {
    p += K * detSin(th)
    th = wrap(th + p)
    total += p
  }
  return total / (TAU * n)
}

export interface CircleTest {
  /** p₀ (at θ₀ = 0) whose orbit turns with the requested rotation number */
  p0: number
  /** true: an orbit with exactly this rotation number lies on a smooth closed curve (the torus survives) */
  survives: boolean
  /** largest jump in p between orbit points neighbouring in θ (0 for a smooth curve) */
  roughness: number
  /** rotation number measured over 20,000 and 200,000 iterations from p₀ */
  measured: [number, number]
}

/**
 * Is there still an invariant circle with rotation number w at kick strength K? Find the
 * starting p₀ with that rotation number (bisection: the map twists, so it grows with p₀; coarse
 * steps first, then 20,000 iterations per step), then require all of
 *   - the orbit really turns at w, and at the same rate over 20,000 and over 200,000
 *     iterations (a chaotic orbit's average drifts, a circle's converges like 1/n),
 *   - its points draw a smooth graph p = f(θ).
 * A finite test: near the breaking point it can go either way; the literature value for the
 * golden circle is K ≈ 0.9716 (and ≈ 0.957 for √2 − 1).
 */
export function circleTest(K: number, w: number): CircleTest {
  let lo = 0
  let hi = TAU
  for (let i = 0; i < 44; i++) {
    const mid = (lo + hi) / 2
    if (rotationNumber(K, mid, i < 24 ? 3000 : 20000) < w) lo = mid
    else hi = mid
  }
  const p0 = (lo + hi) / 2
  const n = 20000
  const pts: [number, number][] = []
  let th = 0
  let p = p0
  for (let i = 0; i < n; i++) {
    p += K * detSin(th)
    th = wrap(th + p)
    pts.push([th, p])
  }
  pts.sort((a, b) => a[0] - b[0])
  let roughness = 0
  for (let i = 1; i < pts.length; i++) roughness = Math.max(roughness, Math.abs(pts[i]![1] - pts[i - 1]![1]))
  const measured: [number, number] = [rotationNumber(K, p0, n), rotationNumber(K, p0, 10 * n)]
  // the bisection decides with 20,000-iteration averages (±~5e-5), so it lands within that of w;
  // a chaotic orbit found instead drifts by 1e-3 or more between the two lengths
  const turnsRight = Math.abs(measured[1] - w) < 5e-5 && Math.abs(measured[0] - measured[1]) < 5e-5
  return { p0, survives: roughness < 0.05 && turnsRight, roughness, measured }
}

/** Where the wall test started: next to the unstable point (θ, p) = (0, 0). */
export const WALL_START = { th: 1e-3, p: 0 }

/**
 * Advance the wall test by up to `n` iterations from `s` (p kept unwrapped). `crossed`: the
 * iteration (1-based, within this call) at which |p| exceeded a full turn, else null.
 */
export function wallSteps(
  K: number,
  s: { th: number; p: number },
  n: number,
): { th: number; p: number; crossed: number | null } {
  let th = s.th
  let p = s.p
  for (let i = 1; i <= n; i++) {
    p += K * detSin(th)
    th = wrap(th + p)
    if (p > TAU || p < -TAU) return { th, p, crossed: i }
  }
  return { th, p, crossed: null }
}

/**
 * Can an orbit started next to the unstable point (θ, p) = (0, 0) climb a full turn in p?
 * Any surviving circle around the cylinder is a wall it cannot cross. Returns the iteration at
 * which it crossed, or null if it did not within `max` iterations (not a proof that it never will).
 */
export function crossesWall(K: number, max: number): number | null {
  return wallSteps(K, WALL_START, max).crossed
}

/** Rotation numbers compared in the room (turns per kick): fractional parts, as in the text. */
export const ROTATIONS = [
  { id: 'pi', label: 'π − 3（≈ 1/7）', w: Math.PI - 3 },
  { id: 'e', label: 'e − 2', w: Math.E - 2 },
  { id: 'sqrt2', label: '√2 − 1', w: Math.SQRT2 - 1 },
  { id: 'golden', label: '1/φ²（黄金比）', w: 1 / (PHI * PHI) },
] as const

/** Literature: the golden circle of the standard map is the last to break (Greene 1979). */
export const GOLDEN_CRITICAL_K = 0.971635406
