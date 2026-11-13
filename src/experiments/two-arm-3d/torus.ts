/** Classification of the existing torus parametrization, not a change to the trajectory. */
export type TorusKind = 'ring' | 'horn' | 'spindle' | 'sphere' | 'circle' | 'point'

/** R = arm 1, r = arm 2, before the common positive scale factor. */
export function torusKind(R: number, r: number): TorusKind {
  if (!Number.isFinite(R) || !Number.isFinite(r) || R < 0 || r < 0)
    throw new RangeError('torus radii must be finite and nonnegative')
  if (R === 0 && r === 0) return 'point'
  if (r === 0) return 'circle'
  if (R === 0) return 'sphere'
  if (R === r) return 'horn'
  return R > r ? 'ring' : 'spindle'
}
