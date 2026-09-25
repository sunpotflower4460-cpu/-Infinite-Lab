import { bitLength, pow10 } from './precision/bigint'

/**
 * High-precision constant as binary fixed point: value ≈ raw / 2^bits (floor).
 * Built from the constant's computed decimal digits.
 */
export interface BinaryConstant {
  raw: bigint
  bits: number
  /** Decimal digits of the constant that were used (after the point). */
  decimals: number
}

export const CONSTANT_BITS = 448
/** Decimals of the constant used for exact reduction (≈ 10^-120 relative accuracy). */
export const CONSTANT_DECIMALS = 120

const cache = new Map<string, BinaryConstant>()

/**
 * The constant with exactly CONSTANT_DECIMALS certified decimals, independent of the precision
 * chosen for the digit stream — so rules using C (e.g. Pi Rotation) give the same result at
 * any precision and across Infinite Mode extensions.
 */
export function binaryConstantFor(
  id: string,
  compute: (precision: number) => { digits: string; integerPartLength: number },
): BinaryConstant {
  let c = cache.get(id)
  if (!c) {
    const r = compute(CONSTANT_DECIMALS)
    c = binaryConstant(
      Uint8Array.from(r.digits, (ch) => ch.charCodeAt(0) - 48),
      r.integerPartLength,
    )
    cache.set(id, c)
  }
  return c
}

export function binaryConstant(digits: ArrayLike<number>, integerPartLength: number): BinaryConstant {
  const decimals = Math.min(CONSTANT_DECIMALS, digits.length - integerPartLength)
  let s = ''
  for (let i = 0; i < integerPartLength + decimals; i++) s += String(digits[i])
  const raw = (BigInt(s) << BigInt(CONSTANT_BITS)) / pow10(decimals)
  return { raw, bits: CONSTANT_BITS, decimals }
}

const f64 = new Float64Array(1)
const u32 = new Uint32Array(f64.buffer)
const HI = new Uint8Array(new Uint16Array([1]).buffer)[0] === 1 ? 1 : 0

/** x = mant · 2^exp exactly (x finite). */
export function decomposeDouble(x: number): { mant: bigint; exp: number } {
  if (!Number.isFinite(x)) throw new RangeError(`not finite: ${x}`)
  if (x === 0) return { mant: 0n, exp: 0 }
  f64[0] = x
  const hi = u32[HI]! >>> 0
  const lo = u32[1 - HI]! >>> 0
  const biased = (hi >>> 20) & 0x7ff
  const frac = (BigInt(hi & 0xfffff) << 32n) | BigInt(lo)
  const mant = biased === 0 ? frac : frac | (1n << 52n)
  const exp = (biased === 0 ? 1 : biased) - 1075
  return { mant: x < 0 ? -mant : mant, exp }
}

/**
 * (f₁ × f₂ × … × C) mod m, where the fᵢ are float64 values taken exactly (as the
 * rationals they represent) and C is the high-precision constant. The product and the
 * reduction are done in BigInt; only the final result is rounded to float64.
 * Unlike repeated float64 addition, this does not drift as n grows.
 */
export function constantProductMod(factors: number[], c: BinaryConstant, modulus: number): number {
  if (!Number.isInteger(modulus) || modulus <= 0) throw new RangeError(`invalid modulus ${modulus}`)
  let M = c.raw
  let E = -c.bits
  for (const f of factors) {
    const d = decomposeDouble(f)
    M *= d.mant
    E += d.exp
  }
  if (M === 0n) return 0
  let r: bigint
  if (E >= 0) {
    const m = BigInt(modulus)
    r = (M << BigInt(E)) % m
    if (r < 0n) r += m
    return Number(r)
  }
  const m = BigInt(modulus) << BigInt(-E) // modulus in units of 2^E
  r = M % m
  if (r < 0n) r += m
  if (r === 0n) return 0
  const shift = Math.max(0, bitLength(r) - 64)
  return Number(r >> BigInt(shift)) * 2 ** (E + shift)
}
