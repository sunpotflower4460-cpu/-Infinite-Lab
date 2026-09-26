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

/** a / b as a float, for huge BigInts (keeps ~17 significant digits). */
function ratio(a: bigint, b: bigint): number {
  if (a === 0n) return 0
  const shift = Math.max(0, a.toString(2).length - 60, b.toString(2).length - 60)
  const s = BigInt(shift)
  return Number(a >> s) / Number(b >> s)
}

// ---- 4. filling a torus ----------------------------------------------------------------------

/**
 * The flat torus (the square with opposite edges glued): the line x = t, y = a·t (mod 1).
 * On the two-arm torus, x is arm 1's turn and y arm 2's, so a is the speed ratio.
 * Returns, for each whole turn 0…turns, the fraction of the N×N cells the line has passed.
 */
export function coverageByTurn(a: number, turns: number, N = 100): number[] {
  const seen = new Uint8Array(N * N)
  const frac = a - Math.floor(a)
  const perTurn = Math.ceil(N * 8 * Math.hypot(1, frac)) // < 1/8 cell between samples
  const out = [0]
  let count = 0
  for (let turn = 0; turn < turns; turn++) {
    for (let i = 0; i < perTurn; i++) {
      const x = i / perTurn
      // y = frac · (turn + x) mod 1, with the whole-turn part reduced first (exact-ish for large turns)
      const y0 = (frac * turn) % 1
      let y = (y0 + frac * x) % 1
      if (y < 0) y += 1
      const cell = Math.min(N - 1, Math.floor(y * N)) * N + Math.min(N - 1, Math.floor(x * N))
      if (!seen[cell]) {
        seen[cell] = 1
        count++
      }
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
  /** true: the orbit lies on a smooth closed curve around the cylinder (the torus survives) */
  survives: boolean
  /** largest jump in p between orbit points neighbouring in θ (0 for a smooth curve) */
  roughness: number
}

/**
 * Is there still an invariant circle with rotation number w at kick strength K? Find the
 * starting p₀ with that rotation number (bisection: the map twists, so it grows with p₀), then
 * check that its orbit draws a smooth graph p = f(θ). A finite test (`n` iterations): near the
 * breaking point it can go either way; the literature value for the golden circle is K ≈ 0.9716.
 */
export function circleTest(K: number, w: number, n = 20000): CircleTest {
  let lo = 0
  let hi = TAU
  for (let i = 0; i < 48; i++) {
    const mid = (lo + hi) / 2
    if (rotationNumber(K, mid) < w) lo = mid
    else hi = mid
  }
  const p0 = (lo + hi) / 2
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
  return { p0, survives: roughness < 0.05, roughness }
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
