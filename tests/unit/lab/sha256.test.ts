import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { sha256Hex } from '../../../src/utils/sha256'

describe('portable SHA-256', () => {
  it('matches the FIPS test vectors', () => {
    expect(sha256Hex(new TextEncoder().encode('abc'))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    )
    expect(sha256Hex(new Uint8Array())).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    )
  })

  it.each([1, 55, 56, 63, 64, 65, 119, 120, 1000, 100_003])('matches node:crypto for %i bytes', (n) => {
    const data = new Uint8Array(n)
    for (let i = 0; i < n; i++) data[i] = (i * 131 + 7) & 0xff
    expect(sha256Hex(data)).toBe(createHash('sha256').update(data).digest('hex'))
  })
})
