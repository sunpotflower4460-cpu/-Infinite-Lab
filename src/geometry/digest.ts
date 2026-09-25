import { sha256Hex } from '../utils/sha256'
import type { GeometryStore } from './GeometryStore'

/**
 * SHA-256 of the first `count` geometry records, serialized as little-endian IEEE-754
 * float64 (see GeometryStore.bytes). Because the whole pipeline is deterministic, the same
 * experiment description reproduces the same digest on any engine / platform.
 * Uses WebCrypto when available, a portable implementation otherwise (non-secure contexts).
 */
export async function geometryDigest(store: GeometryStore, count: number): Promise<string> {
  const bytes = store.bytes(count)
  const subtle = globalThis.crypto?.subtle
  if (!subtle) return sha256Hex(bytes)
  const hash = await subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, '0')).join('')
}
