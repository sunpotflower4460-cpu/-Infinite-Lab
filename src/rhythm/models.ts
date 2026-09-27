/**
 * The laws behind the "rhythm" textbook (#rhythm), ported line by line from the research code
 * (aeterna-genesis: genesis/models/standard_map.py, genesis/models/forced_oscillator.py,
 * tools/golden_forcing.py, report docs/reports/2026-09-27-p16-golden.md). Same equations, same
 * constants, same criteria, so what the page measures on the spot can be set beside the report.
 *
 *   standard map   p' = p + (K/2π) sin 2πx,  x' = x + p'                 (x mod 1)
 *   FitzHugh–Nagumo u' = D∇²u + u − u³/3 − v + I0 + γ cos Ωt,  v' = ε(u + a − b v)
 *
 * The outside beat (γ, s) is put in; whether a rhythm is captured, at which fraction, and whether
 * spirals are born are measured.
 */

export const GOLDEN = (Math.sqrt(5) - 1) / 2 // 1/φ = 0.6180…
export const TAU = 2 * Math.PI

/** The ratios the report compares. */
export const RATIOS = [
  { id: 'golden', label: '黄金比 1/φ', short: '1/φ', w: GOLDEN },
  { id: 'sqrt2m1', label: '√2 − 1', short: '√2−1', w: Math.SQRT2 - 1 },
  { id: 'inve', label: '1/e', short: '1/e', w: 1 / Math.E },
  { id: 'invsqrt2', label: '1/√2', short: '1/√2', w: Math.SQRT1_2 },
  { id: 'invpi', label: '1/π', short: '1/π', w: 1 / Math.PI },
] as const

// ---- standard map (Chirikov–Taylor) --------------------------------------------------------

/** Weights of the weighted Birkhoff average (Das, Sander & Yorke 2016), normalised. */
export function bump(N: number): Float64Array {
  const w = new Float64Array(N)
  let sum = 0
  for (let i = 0; i < N; i++) {
    const t = (i + 1) / (N + 1)
    w[i] = Math.exp(-1 / (t * (1 - t)))
    sum += w[i]!
  }
  for (let i = 0; i < N; i++) w[i]! /= sum
  return w
}

const K2PI = 1 / (2 * Math.PI)

/**
 * Rotation numbers of orbits started at (x0, p0) by weighted Birkhoff averages of the momentum over
 * two successive windows of N kicks. err = |difference|: ~1e-12 on an invariant circle, ~1e-3 in chaos.
 * x is not reduced mod 1 (sin is periodic), exactly as in the research code.
 */
export function rotation(
  K: number,
  p0: ArrayLike<number>,
  N = 20000,
  x0 = 0,
  w: Float64Array = bump(N),
): { w: Float64Array; err: Float64Array } {
  const n = p0.length
  const om = new Float64Array(n)
  const err = new Float64Array(n)
  const k = K * K2PI
  for (let j = 0; j < n; j++) {
    let x = x0
    let p = p0[j]!
    let a1 = 0
    let a2 = 0
    for (let i = 0; i < N; i++) {
      p = p + k * Math.sin(TAU * x)
      x = x + p
      a1 += w[i]! * p
    }
    for (let i = 0; i < N; i++) {
      p = p + k * Math.sin(TAU * x)
      x = x + p
      a2 += w[i]! * p
    }
    om[j] = a1
    err[j] = Math.abs(a1 - a2)
  }
  return { w: om, err }
}

/** Closest fraction with denominator ≤ qmax (Python's Fraction.limit_denominator, in doubles). */
export function limitDenominator(x: number, qmax: number): { p: number; q: number } {
  let [p0, q0, p1, q1] = [0, 1, 1, 0]
  let r = x
  for (let i = 0; i < 64; i++) {
    const a = Math.floor(r)
    const q2 = q0 + a * q1
    if (q2 > qmax) break
    ;[p0, q0, p1, q1] = [p1, q1, p0 + a * p1, q2]
    const frac = r - a
    if (frac < 1e-15) return { p: p1, q: q1 }
    r = 1 / frac
  }
  const k = Math.floor((qmax - q0) / q1)
  const b1 = { p: p0 + k * p1, q: q0 + k * q1 }
  const b2 = { p: p1, q: q1 }
  return Math.abs(b2.p / b2.q - x) <= Math.abs(b1.p / b1.q - x) ? b2 : b1
}

export function nearFraction(w: number, qmax = 300, tol = 1e-7): boolean {
  const f = limitDenominator(w, qmax)
  return Math.abs(f.p / f.q - w) < tol
}

/**
 * The report's scan (A): n orbits from the symmetry line x = 0, p0 ∈ [0, 1]; the rotation numbers of
 * those that are rotational circles (regular, 0 < ω < 1, not an island at a small fraction).
 */
export function circles(K: number, n = 4001, N = 20000, regTol = 1e-9, w = bump(N)): number[] {
  return circlesWithStart(K, n, N, regTol, w).map((c) => c.w)
}

/** The same scan, keeping where each circle starts (x = 0, p0), sorted by rotation number. */
export function circlesWithStart(
  K: number,
  n = 4001,
  N = 20000,
  regTol = 1e-9,
  w = bump(N),
): { p0: number; w: number }[] {
  const p0 = Float64Array.from({ length: n }, (_, i) => i / (n - 1))
  const r = rotation(K, p0, N, 0, w)
  const keep: { p0: number; w: number }[] = []
  for (let i = 0; i < n; i++) if (isCircle(r.w[i]!, r.err[i]!, regTol)) keep.push({ p0: p0[i]!, w: r.w[i]! })
  return keep.sort((a, b) => a.w - b.w)
}

/** A rotational circle: regular, 0 < ω < 1, and not an island turning at a small fraction. */
export const isCircle = (om: number, err: number, regTol = 1e-9) =>
  err < regTol && om > 0 && om < 1 && !nearFraction(om)

/** The report's K grid (rounded to 3 decimals there) for "the last K with a circle within 1e-3". */
export const K_GRID = [
  0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8, 0.85, 0.9, 0.95, 0.952, 0.955, 0.957, 0.96, 0.962, 0.965, 0.967, 0.97,
  0.972, 0.975, 0.977, 0.98,
]

/** Points of one orbit for drawing: (x mod 1, p mod 1). */
export function smOrbit(K: number, x0: number, p0: number, n: number): Float32Array {
  const out = new Float32Array(2 * n)
  const k = K * K2PI
  let x = x0
  let p = p0
  for (let i = 0; i < n; i++) {
    p = p + k * Math.sin(TAU * x)
    x = x + p
    x -= Math.floor(x)
    out[2 * i] = x
    out[2 * i + 1] = p - Math.floor(p)
  }
  return out
}

// ---- FitzHugh–Nagumo with an outside beat ----------------------------------------------------

export const FHN = { a: 0.7, b: 0.8, eps: 0.08, I0: 0.5, D: 1.0, dt: 0.02 } as const
/** Free period with the defaults (D = 0), measured by the research code's `free_period`. */
export const T0 = 39.4888
/** A point inside the limit cycle: the phase angle turns around it. */
export const U_STAR = 0.4
export const V_STAR = 0.8

export const phaseOf = (u: number, v: number) => Math.atan2(v - V_STAR, u - U_STAR)
const wrap = (x: number) => {
  const y = (x + Math.PI) % TAU
  return (y < 0 ? y + TAU : y) - Math.PI
}

/** One Euler step of a single cell (D = 0). */
export function cellStep(u: number, v: number, t: number, gamma: number, Om: number): [number, number] {
  const { a, b, eps, I0, dt } = FHN
  const du = u - (u * u * u) / 3 - v + I0 + gamma * Math.cos(Om * t)
  return [u + dt * du, v + dt * eps * (u + a - b * v)]
}

/** Period of the unforced cell (upward crossings of u = 0), as `free_period`. */
export function freePeriod(T = 2000): number {
  let u = -1
  let v = -0.5
  let t = 0
  let last: number | null = null
  const per: number[] = []
  for (let i = 0; i < Math.round(T / FHN.dt); i++) {
    const [un, vn] = cellStep(u, v, t, 0, 0)
    if (u < 0 && 0 <= un) {
      const tc = t + FHN.dt * (-u / (un - u))
      if (last !== null) per.push(tc - last)
      last = tc
    }
    u = un
    v = vn
    t += FHN.dt
  }
  const tail = per.slice(-5)
  return tail.reduce((a, b) => a + b, 0) / tail.length
}

export interface Lock {
  /** own turns per beat */
  rho: number
  p: number
  q: number
  locked: boolean
}

/**
 * `lock_of` for one series: `th` is the cumulative phase once per beat (sign already made positive).
 * Captured at p/q (q ≤ qmax) when Θ(k+q) − Θ(k) stays at 2πp for every k (max deviation < tol) and the
 * whole window does not slip either.
 */
export function lockOfSeries(th: ArrayLike<number>, qmax = 12, tol = 0.05): Lock {
  const K = th.length
  const rho = (th[K - 1]! - th[0]!) / (TAU * (K - 1))
  for (let q = 1; q <= qmax; q++) {
    if (K <= q + 2) break
    const d: number[] = []
    for (let k = 0; k + q < K; k++) d.push(th[k + q]! - th[k]!)
    const p = Math.round(median(d) / TAU)
    let dev = 0
    for (const x of d) dev = Math.max(dev, Math.abs(x - TAU * p))
    const m = Math.floor((K - 1) / q) * q
    const drift = Math.abs(th[m]! - th[0]! - TAU * p * (m / q))
    if (dev < tol && drift < tol && p > 0) {
      const g = gcd(p, q)
      return { rho, p: p / g, q: q / g, locked: true }
    }
  }
  return { rho, p: 0, q: 0, locked: false }
}

export function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b)
  const n = s.length
  return n % 2 ? s[(n - 1) / 2]! : (s[n / 2 - 1]! + s[n / 2]!) / 2
}

export function gcd(a: number, b: number): number {
  a = Math.abs(a)
  b = Math.abs(b)
  while (b) [a, b] = [b, a % b]
  return a
}

/**
 * The report's single-cell protocol (`run_cells`): start at (−1, −0.5), a transient of nTrans·T0,
 * then the cumulative phase at nBeats beats (stroboscope, linear interpolation inside a step).
 */
export function runCell(
  s: number,
  gamma: number,
  { nTrans = 60, nBeats = 150, qmax = 12, tol = 0.05 } = {},
): Lock & { strobe: Float64Array } {
  const Om = TAU / (s * T0)
  const Tf = s * T0
  const dt = FHN.dt
  let u = -1
  let v = -0.5
  let theta = phaseOf(u, v)
  let Theta = theta
  let t = 0
  const tStart = nTrans * T0
  const strobe = new Float64Array(nBeats)
  let k = 0
  while (k < nBeats) {
    ;[u, v] = cellStep(u, v, t, gamma, Om)
    t += dt
    const th = phaseOf(u, v)
    const ThNew = Theta + wrap(th - theta)
    // (the research code loops over cells; one sample per step is enough at these beat periods)
    const target = tStart + k * Tf
    if (t >= target) {
      const w = (t - target) / dt
      strobe[k] = ThNew - w * (ThNew - Theta)
      k++
    }
    Theta = ThNew
    theta = th
  }
  const th = strobe[nBeats - 1]! < strobe[0]! ? strobe.map((x) => -x) : strobe
  return { ...lockOfSeries(th, qmax, tol), strobe: th }
}

/**
 * Smallest γ on the report's grid (0.005, 0.01, …, 0.3) that captures a cell at this s (null: none).
 * γ = 0 is left out: with no beat there is nothing to be captured by, though a ratio that is exactly a
 * fraction (s = 1/2) passes the same test.
 */
export function firstCapture(s: number, step = 0.005, max = 0.3): number | null {
  for (let i = 1; i * step <= max + 1e-12; i++) {
    const g = +(i * step).toFixed(6)
    if (runCell(s, g).locked) return g
  }
  return null
}

// ---- the medium (2D / 3D grid of cells, periodic) ------------------------------------------

/** Small, fast, seeded random numbers (mulberry32) with normal deviates (Box–Muller). */
export function rng(seed: number) {
  let a = seed >>> 0
  const uniform = () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  let spare: number | null = null
  const normal = () => {
    if (spare !== null) {
      const s = spare
      spare = null
      return s
    }
    let x = 0
    while (x === 0) x = uniform()
    const r = Math.sqrt(-2 * Math.log(x))
    const th = TAU * uniform()
    spare = r * Math.sin(th)
    return r * Math.cos(th)
  }
  return { uniform, normal }
}

/** Neighbour index tables of a periodic n^dim grid (2·dim neighbours per cell). */
export function neighbours(n: number, dim: 2 | 3): Int32Array {
  const size = n ** dim
  const nb = new Int32Array(size * 2 * dim)
  const strides = dim === 2 ? [n, 1] : [n * n, n, 1]
  for (let i = 0; i < size; i++) {
    for (let d = 0; d < dim; d++) {
      const st = strides[d]!
      const c = Math.floor(i / st) % n
      const base = i - c * st
      nb[i * 2 * dim + 2 * d] = base + ((c + 1) % n) * st
      nb[i * 2 * dim + 2 * d + 1] = base + ((c + n - 1) % n) * st
    }
  }
  return nb
}

/**
 * `smooth_noise`: white noise smoothed by round(corr²) local averagings, scaled to [0, 1]. (The random
 * numbers are this page's own, so the patches differ from the report's; the recipe is the same.)
 */
export function smoothNoise(n: number, dim: 2 | 3, normal: () => number, corr = 6, nb = neighbours(n, dim)) {
  const size = n ** dim
  let f = new Float64Array(size)
  let g = new Float64Array(size)
  for (let i = 0; i < size; i++) f[i] = normal()
  const k = 2 * dim
  for (let r = 0; r < Math.round(corr * corr); r++) {
    for (let i = 0; i < size; i++) {
      let s = 0
      for (let j = 0; j < k; j++) s += f[nb[i * k + j]!]!
      g[i] = (s / k) * 0.5 + 0.5 * f[i]!
    }
    ;[f, g] = [g, f]
  }
  let lo = Infinity
  let hi = -Infinity
  for (let i = 0; i < size; i++) {
    lo = Math.min(lo, f[i]!)
    hi = Math.max(hi, f[i]!)
  }
  const span = Math.max(hi - lo, 1e-12)
  for (let i = 0; i < size; i++) f[i] = (f[i]! - lo) / span
  return f
}

export interface MediumResult {
  /** share of the medium captured, and the fractions it is captured at (share each, largest first) */
  captured: number
  at: { frac: string; share: number }[]
  rhoMedian: number
  /** spiral tips (2D) or plaquettes pierced by a vortex line (3D) in the last frame */
  vortices: number
}

/**
 * A 2D or 3D grid of FitzHugh–Nagumo cells, coupled to their neighbours (D∇²u), under a uniform beat.
 * The protocol of `run_medium`: patchy random start, a transient of nTrans·T0, then nBeats beats of the
 * stroboscope, then `lock_of` for every cell.
 */
export class Medium {
  readonly size: number
  u: Float64Array
  v: Float64Array
  private u2: Float64Array
  private v2: Float64Array
  t = 0
  s: number
  gamma: number
  // stroboscope
  private Theta: Float64Array
  private theta: Float64Array
  strobe: Float64Array[] = []
  private tStart = Infinity
  private beats = 0
  private since = 0
  private steps = 0

  constructor(
    readonly n: number,
    readonly dim: 2 | 3,
    s: number,
    gamma: number,
    seed: number,
  ) {
    this.size = n ** dim
    this.s = s
    this.gamma = gamma
    const nb = neighbours(n, dim)
    const r = rng(seed)
    const a = smoothNoise(n, dim, r.normal, 6, nb)
    const b = smoothNoise(n, dim, r.normal, 6, nb)
    this.u = a.map((x) => -2 + 4 * x)
    this.v = b.map((x) => -0.5 + 2 * x)
    this.u2 = new Float64Array(this.size)
    this.v2 = new Float64Array(this.size)
    this.Theta = new Float64Array(this.size)
    this.theta = new Float64Array(this.size)
  }

  get Tf() {
    return this.s * T0
  }

  /** Change the beat without restarting (the measurement starts again after nTrans·T0). */
  setBeat(s: number, gamma: number) {
    this.s = s
    this.gamma = gamma
  }

  /** Start sampling the stroboscope at time tStart (beats every Tf from then on). */
  measureFrom(tStart: number, beats: number) {
    this.tStart = tStart
    this.beats = beats
    this.strobe = []
    this.since = 0
  }

  /** when the stroboscope starts (after the transient) */
  get tStartTime() {
    return this.tStart
  }

  get measuring() {
    return this.t >= this.tStart - FHN.dt && this.strobe.length < this.beats
  }

  get measured() {
    return this.beats > 0 && this.strobe.length >= this.beats
  }

  /** Current beat drive, for drawing the drum: cos Ωt. */
  get drive() {
    return Math.cos((TAU / this.Tf) * this.t)
  }

  step(count: number) {
    const Om = TAU / this.Tf
    const grid = this.dim === 2 ? step2d : step3d
    for (let c = 0; c < count; c++) {
      grid(this.u, this.v, this.u2, this.v2, this.n, FHN.I0 + this.gamma * Math.cos(Om * this.t))
      const u = this.u
      const v = this.v
      this.u = this.u2
      this.v = this.v2
      this.u2 = u
      this.v2 = v
      this.t += FHN.dt
      this.steps++
      this.track()
    }
  }

  /**
   * Stroboscope: cumulative phases. The research code unwraps every step; here every 4th step (a
   * phase moves far less than π in 4 steps) and on the two steps around each beat, which gives the
   * same numbers at a fraction of the cost.
   */
  private track() {
    if (this.beats === 0 || this.strobe.length >= this.beats) return
    const size = this.size
    const dt = FHN.dt
    if (this.t < this.tStart - 2 * dt) return
    if (this.since === 0) {
      // first step of the window: the phases start here (only differences are used)
      for (let i = 0; i < size; i++) this.theta[i] = this.Theta[i] = phaseOf(this.u[i]!, this.v[i]!)
      this.since = 1
      return
    }
    const target = this.tStart + this.strobe.length * this.Tf
    const hit = this.t >= target
    if (!hit && this.t + 1.5 * dt < target && this.steps % 4 !== 0) return
    const w = (this.t - target) / dt
    const row = hit ? new Float64Array(size) : null
    for (let i = 0; i < size; i++) {
      const th = phaseOf(this.u[i]!, this.v[i]!)
      const prev = this.Theta[i]!
      const next = prev + wrap(th - this.theta[i]!)
      if (row) row[i] = next - w * (next - prev)
      this.Theta[i] = next
      this.theta[i] = th
    }
    if (row) this.strobe.push(row)
  }

  /** `lock_of` over the whole medium, and the vortices of the last frame. */
  result(qmax = 8, tol = 0.05): MediumResult {
    const K = this.strobe.length
    const size = this.size
    let first = 0
    let last = 0
    for (let i = 0; i < size; i++) {
      first += this.strobe[0]![i]!
      last += this.strobe[K - 1]![i]!
    }
    const sign = last < first ? -1 : 1
    const series = new Float64Array(K)
    const counts = new Map<string, number>()
    const rhos = new Float64Array(size)
    let captured = 0
    for (let i = 0; i < size; i++) {
      for (let k = 0; k < K; k++) series[k] = sign * this.strobe[k]![i]!
      const l = lockOfSeries(series, qmax, tol)
      rhos[i] = l.rho
      if (l.locked) {
        captured++
        const f = `${l.p}/${l.q}`
        counts.set(f, (counts.get(f) ?? 0) + 1)
      }
    }
    rhos.sort()
    const at = [...counts.entries()]
      .sort((x, y) => y[1] - x[1])
      .slice(0, 4)
      .map(([frac, c]) => ({ frac, share: c / size }))
    return {
      captured: captured / size,
      at,
      rhoMedian: rhos[Math.floor(size / 2)]!,
      vortices: this.vortices(),
    }
  }

  /** Phase windings (the research code's `vortices_2d`; in 3D, over the plaquettes of all 3 planes). */
  vortices(): number {
    const n = this.n
    const ph = new Float64Array(this.size)
    for (let i = 0; i < this.size; i++) ph[i] = phaseOf(this.u[i]!, this.v[i]!)
    const winding = (i: number, s1: number, s2: number, c1: number, c2: number) => {
      const i1 = c1 === n - 1 ? i - (n - 1) * s1 : i + s1
      const i2 = c2 === n - 1 ? i - (n - 1) * s2 : i + s2
      const i12 = c2 === n - 1 ? i1 - (n - 1) * s2 : i1 + s2
      const d =
        wrap(ph[i1]! - ph[i]!) + wrap(ph[i12]! - ph[i1]!) + wrap(ph[i2]! - ph[i12]!) + wrap(ph[i]! - ph[i2]!)
      return Math.round(d / TAU) !== 0
    }
    let count = 0
    if (this.dim === 2) {
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (winding(y * n + x, n, 1, y, x)) count++
      return count
    }
    const st = [n * n, n, 1]
    for (let z = 0; z < n; z++)
      for (let y = 0; y < n; y++)
        for (let x = 0; x < n; x++) {
          const i = z * n * n + y * n + x
          const c = [z, y, x]
          for (const [a, b] of [
            [0, 1],
            [0, 2],
            [1, 2],
          ] as const)
            if (winding(i, st[a]!, st[b]!, c[a]!, c[b]!)) count++
        }
    return count
  }
}

// One Euler step of the whole grid (periodic). Written out per dimension, without a neighbour table:
// this runs live in the page.
const { a: FA, b: FB, eps: FE, D: FD, dt: FDT } = FHN

function step2d(
  u: Float64Array,
  v: Float64Array,
  un: Float64Array,
  vn: Float64Array,
  n: number,
  drive: number,
) {
  for (let y = 0; y < n; y++) {
    const row = y * n
    const up = ((y + 1) % n) * n
    const dn = ((y + n - 1) % n) * n
    for (let x = 0; x < n; x++) {
      const i = row + x
      const ui = u[i]!
      const vi = v[i]!
      const xr = x === n - 1 ? 0 : x + 1
      const xl = x === 0 ? n - 1 : x - 1
      const lap = u[row + xr]! + u[row + xl]! + u[up + x]! + u[dn + x]! - 4 * ui
      un[i] = ui + FDT * (ui - (ui * ui * ui) / 3 - vi + drive + FD * lap)
      vn[i] = vi + FDT * FE * (ui + FA - FB * vi)
    }
  }
}

function step3d(
  u: Float64Array,
  v: Float64Array,
  un: Float64Array,
  vn: Float64Array,
  n: number,
  drive: number,
) {
  const nn = n * n
  for (let z = 0; z < n; z++) {
    const zo = z * nn
    const zu = ((z + 1) % n) * nn
    const zd = ((z + n - 1) % n) * nn
    for (let y = 0; y < n; y++) {
      const yo = y * n
      const row = zo + yo
      const up = zo + ((y + 1) % n) * n
      const dn = zo + ((y + n - 1) % n) * n
      for (let x = 0; x < n; x++) {
        const i = row + x
        const ui = u[i]!
        const vi = v[i]!
        const xr = x === n - 1 ? 0 : x + 1
        const xl = x === 0 ? n - 1 : x - 1
        const lap =
          u[row + xr]! + u[row + xl]! + u[up + x]! + u[dn + x]! + u[zu + yo + x]! + u[zd + yo + x]! - 6 * ui
        un[i] = ui + FDT * (ui - (ui * ui * ui) / 3 - vi + drive + FD * lap)
        vn[i] = vi + FDT * FE * (ui + FA - FB * vi)
      }
    }
  }
}

/** The report's protocol lengths for the medium. */
export const MEDIUM_TRANSIENT = 40 // × T0
export const MEDIUM_BEATS = 45
