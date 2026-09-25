import type { GeometryBatch } from '../geometry/batch'
import type { GeometryInstruction } from '../geometry/types'
import type { Camera } from './Camera'

/**
 * The renderer knows nothing about mathematics: it receives world-space geometry
 * records and draws them. Swappable (PixiJS Graphics today, instanced SDF later).
 */
export interface Renderer {
  init(host: HTMLElement): Promise<void>
  append(batch: GeometryBatch): void
  /** Emphasise the geometry of one step (e.g. the current / inspected step). */
  setHighlight(instructions: GeometryInstruction[] | null): void
  clear(): void
  fitAll(): void
  readonly camera: Camera
  readonly objectCount: number
  /** Frames rendered during the last second (rendering is on demand). */
  readonly fps: number
  readonly lastRenderMs: number
  /** Called when the user moves the camera manually (used to disable auto-follow). */
  onUserCamera?: () => void
  follow: boolean
  destroy(): void
}
