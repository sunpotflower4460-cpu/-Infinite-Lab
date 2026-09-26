/**
 * Engines cap the size of a BigInt: V8 (Chrome, Edge) and JavaScriptCore (Safari) allow
 * about 2^30 bits, SpiderMonkey (Firefox) only 2^20 = 1,048,576 bits. Computing d digits needs
 * intermediate products of about 2·d digits (e.g. √(10005·10^{2d}) in Chudnovsky), so the
 * number of digits a browser can compute follows from this cap.
 */
let cached: number | undefined

/** Probe cap: 2^23 bits (1 MiB) is far more than 1,000,000 digits need. */
const PROBE_CAP = 1 << 23

/** Largest BigInt bit length this engine allocates, up to PROBE_CAP (probed once). */
export function maxBigIntBits(): number {
  if (cached !== undefined) return cached
  const fits = (bits: number) => {
    try {
      return 1n << BigInt(bits) > 0n
    } catch {
      return false
    }
  }
  if (fits(PROBE_CAP)) return (cached = PROBE_CAP)
  let lo = 1 << 16
  let hi = PROBE_CAP
  while (hi - lo > 256) {
    const mid = Math.floor((lo + hi) / 2)
    if (fits(mid)) lo = mid
    else hi = mid
  }
  return (cached = lo)
}

/** Digits computable with BigInts of at most `bits` bits (2·d digits of intermediates, 10 % margin). */
export function digitsForBits(bits: number): number {
  return Math.floor((bits * 0.9) / (2 * Math.log2(10)) / 1000) * 1000
}
