/**
 * Exact integer helpers on native BigInt.
 * Nothing in this file touches floating point: every result is exact.
 */

/** Number of bits needed to represent |n| (0 for n = 0). */
export function bitLength(n: bigint): number {
  if (n < 0n) n = -n
  if (n === 0n) return 0
  const hex = n.toString(16)
  const lead = parseInt(hex[0]!, 16)
  return (hex.length - 1) * 4 + (32 - Math.clz32(lead))
}

/** 10^n as BigInt. */
export function pow10(n: number): bigint {
  if (!Number.isInteger(n) || n < 0) throw new RangeError(`pow10: invalid exponent ${n}`)
  return 10n ** BigInt(n)
}

/**
 * Integer square root: the largest integer a with a*a <= n.
 * Precision-doubling algorithm (the same one CPython's math.isqrt uses);
 * each iteration doubles the number of correct leading bits.
 */
export function isqrt(n: bigint): bigint {
  if (n < 0n) throw new RangeError('isqrt of negative number')
  if (n < 2n) return n
  const c = BigInt((bitLength(n) - 1) >> 1)
  const cBits = bitLength(c)
  let a = 1n
  let d = 0n
  for (let s = cBits - 1; s >= 0; s--) {
    const e = d
    d = c >> BigInt(s)
    a = (a << (d - e - 1n)) + (n >> (2n * c - e - d + 1n)) / a
  }
  return a * a > n ? a - 1n : a
}
