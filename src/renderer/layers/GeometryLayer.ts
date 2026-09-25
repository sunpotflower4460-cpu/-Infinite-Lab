import type { Container } from 'pixi.js'
import type { GeometryStore } from '../../geometry/GeometryStore'

export const COLORS = {
  background: 0x04050a,
  line: 0x7f9cff,
  lineAlpha: 0.28,
  circle: 0xe8eeff,
  circleAlpha: 0.5,
  point: 0xe8eeff,
  pointAlpha: 0.7,
  highlight: 0xffc766,
}

/**
 * Float32 precision frame shared by all layers: GPU coordinates are
 * (world − origin) × bucket, and the container maps them to the screen.
 */
export interface LayerFrame {
  bucket: number
  originX: number
  originY: number
  /** Screen pixels per layer unit (zoom / bucket). */
  pxPerUnit: number
}

/** Turns render-model records (GeometryStore) into GPU geometry. Knows no mathematics. */
export interface GeometryLayer {
  readonly name: string
  readonly container: Container
  /**
   * Bring GPU geometry up to date with the first `visibleCount` records.
   * `full` = the frame (origin / bucket) changed and everything must be rebuilt.
   * Returns true if anything changed.
   */
  sync(store: GeometryStore, visibleCount: number, frame: LayerFrame, full: boolean): boolean
  /** Camera zoom changed within the bucket (pixel-size dependent parameters). */
  setPixelScale(pxPerUnit: number): void
  clear(): void
  destroy(): void
}
