/**
 * Deterministic sin / cos.
 *
 * ECMAScript does not specify the exact results of Math.sin / Math.cos, so different
 * engines (V8, SpiderMonkey, JavaScriptCore) may differ in the last bit. To guarantee
 * "same input → bit-identical geometry" everywhere, geometry code uses this port of
 * FreeBSD msun / fdlibm (k_sin.c, k_cos.c, e_rem_pio2.c), built only from IEEE-754
 * +, −, ×, ÷ which are exactly specified.
 *
 * Accuracy: < 1 ulp (same as fdlibm). Argument reduction:
 *   |x| ≤ π/4              — none
 *   |x| < 2^20·π/2          — Cody–Waite with a 3-part π/2 (fdlibm "medium" path)
 *   larger                  — exact BigInt reduction against a 1600-bit π/2
 */

import { chudnovskyPi } from './algorithms/chudnovsky'

const f64 = new Float64Array(1)
const u32 = new Uint32Array(f64.buffer)
const HI = new Uint8Array(new Uint16Array([1]).buffer)[0] === 1 ? 1 : 0 // little-endian → high word at index 1

function highWord(x: number): number {
  f64[0] = x
  return u32[HI]! >>> 0
}

// k_sin.c
const S1 = -1.66666666666666324348e-1
const S2 = 8.33333333332248946124e-3
const S3 = -1.98412698298579493134e-4
const S4 = 2.75573137070700676789e-6
const S5 = -2.50507602534068634195e-8
const S6 = 1.58969099521155010221e-10

function kernelSin(x: number, y: number, iy: 0 | 1): number {
  const z = x * x
  const w = z * z
  const r = S2 + z * (S3 + z * S4) + z * w * (S5 + z * S6)
  const v = z * x
  if (iy === 0) return x + v * (S1 + z * r)
  return x - (z * (0.5 * y - v * r) - y - v * S1)
}

// k_cos.c
const C1 = 4.16666666666666019037e-2
const C2 = -1.38888888888741095749e-3
const C3 = 2.48015872894767294178e-5
const C4 = -2.75573143513906633035e-7
const C5 = 2.0875723212981748279e-9
const C6 = -1.13596475577881948265e-11

function kernelCos(x: number, y: number): number {
  const z = x * x
  let w = z * z
  const r = z * (C1 + z * (C2 + z * C3)) + w * w * (C4 + z * (C5 + z * C6))
  const hz = 0.5 * z
  w = 1 - hz
  return w + (1 - w - hz + (z * r - x * y))
}

// e_rem_pio2.c (medium path)
const INV_PIO2 = 6.36619772367581382433e-1
const PIO2_1 = 1.57079632673412561417
const PIO2_1T = 6.07710050650619224932e-11
const PIO2_2 = 6.0771005063039659766e-11
const PIO2_2T = 2.02226624879595063154e-21
const PIO2_3 = 2.0222662487111664558e-21
const PIO2_3T = 8.47842766036889956997e-32
const TO_INT = 6755399441055744 // 1.5 · 2^52: forces round-to-nearest-integer

/** Reduced argument: x = n·π/2 + (y0 + y1). Returned via module-level slots to avoid allocation. */
let remY0 = 0
let remY1 = 0

function remPio2(x: number, ix: number): number {
  if (ix < 0x413921fb) {
    // |x| < 2^20 · π/2
    const fn = x * INV_PIO2 + TO_INT - TO_INT
    const n = fn | 0
    let r = x - fn * PIO2_1
    let w = fn * PIO2_1T
    let y0 = r - w
    const j = ix >>> 20
    let i = j - ((highWord(y0) >>> 20) & 0x7ff)
    if (i > 16) {
      let t = r
      w = fn * PIO2_2
      r = t - w
      w = fn * PIO2_2T - (t - r - w)
      y0 = r - w
      i = j - ((highWord(y0) >>> 20) & 0x7ff)
      if (i > 49) {
        t = r
        w = fn * PIO2_3
        r = t - w
        w = fn * PIO2_3T - (t - r - w)
        y0 = r - w
      }
    }
    remY0 = y0
    remY1 = r - y0 - w
    return n
  }
  return remPio2Big(x)
}

// Large arguments: exact reduction with BigInt.
const K = 1600 // bits of fraction for π/2
let halfPiK: bigint | undefined // floor(π/2 · 2^K)

function getHalfPiK(): bigint {
  if (halfPiK === undefined) {
    const digits = 520 // 520 decimal digits > 1600 + 64 bits
    const { raw, scale } = chudnovskyPi(digits + 20)
    halfPiK = (raw << BigInt(K)) / (2n * 10n ** BigInt(scale))
  }
  return halfPiK
}

function decompose(x: number): { mant: bigint; exp: number } {
  // x = mant · 2^exp exactly (x finite, |x| ≥ 2^20·π/2 so it is a normal number)
  f64[0] = x
  const hi = u32[HI]! >>> 0
  const lo = u32[1 - HI]! >>> 0
  const e = ((hi >>> 20) & 0x7ff) - 1075
  const m = (BigInt((hi & 0xfffff) | 0x100000) << 32n) | BigInt(lo)
  return { mant: x < 0 ? -m : m, exp: e }
}

const TWO_120 = 2 ** 120

function remPio2Big(x: number): number {
  const hp = getHalfPiK()
  const { mant, exp } = decompose(x)
  // x · 2^K, exact. exp may be negative (e.g. −29 for x ≈ 1e7), but exp + K ≥ 0 because |x| ≥ 2^20·π/2.
  const X = mant << BigInt(exp + K)
  let n = X / hp
  let r = X - n * hp
  // round to nearest multiple: bring r into [-π/4, π/4]
  if (2n * r > hp) {
    n += 1n
    r -= hp
  } else if (2n * r < -hp) {
    n -= 1n
    r += hp
  }
  const rr = r >> BigInt(K - 120) // r in units of 2^-120 (floor; error < 2^-120)
  const hiPart = Number(rr) // correctly rounded
  remY0 = hiPart / TWO_120
  remY1 = Number(rr - BigInt(hiPart)) / TWO_120
  return Number(n & 3n)
}

const PIO4_HI = 0x3fe921fb

export function detSin(x: number): number {
  const ix = highWord(x) & 0x7fffffff
  if (ix <= PIO4_HI) {
    if (ix < 0x3e500000) return x // |x| < 2^-26
    return kernelSin(x, 0, 0)
  }
  if (ix >= 0x7ff00000) return NaN
  const n = remPio2(x, ix)
  switch (n & 3) {
    case 0:
      return kernelSin(remY0, remY1, 1)
    case 1:
      return kernelCos(remY0, remY1)
    case 2:
      return -kernelSin(remY0, remY1, 1)
    default:
      return -kernelCos(remY0, remY1)
  }
}

export function detCos(x: number): number {
  const ix = highWord(x) & 0x7fffffff
  if (ix <= PIO4_HI) {
    if (ix < 0x3e46a09e) return 1 // |x| < 2^-27·√2
    return kernelCos(x, 0)
  }
  if (ix >= 0x7ff00000) return NaN
  const n = remPio2(x, ix)
  switch (n & 3) {
    case 0:
      return kernelCos(remY0, remY1)
    case 1:
      return -kernelSin(remY0, remY1, 1)
    case 2:
      return -kernelCos(remY0, remY1)
    default:
      return kernelSin(remY0, remY1, 1)
  }
}
