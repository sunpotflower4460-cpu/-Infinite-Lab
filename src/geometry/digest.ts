import type { GeometryStore } from './GeometryStore'

/**
 * SHA-256 of the first `count` geometry records, serialized as little-endian IEEE-754
 * float64 (see GeometryStore.bytes). Because the whole pipeline is deterministic, the same
 * experiment description reproduces the same digest on any engine / platform.
 */
export async function geometryDigest(store: GeometryStore, count: number): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', store.bytes(count))
  return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, '0')).join('')
}
