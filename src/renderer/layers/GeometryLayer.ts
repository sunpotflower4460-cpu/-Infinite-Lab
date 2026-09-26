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

/** Colours and opacities of the drawn geometry (presentation only: never part of the data). */
export interface LayerStyle {
  background: number
  line: number
  lineAlpha: number
  circle: number
  circleAlpha: number
  point: number
  pointAlpha: number
}

export type Look = 'lab' | 'luminous'

/**
 * lab: the default observatory palette. luminous: white strokes on black that add up to a
 * glow where the curve passes often — the look of the reference video (docs/reference).
 */
export const LOOKS: Record<Look, LayerStyle> = {
  lab: {
    background: COLORS.background,
    line: COLORS.line,
    lineAlpha: COLORS.lineAlpha,
    circle: COLORS.circle,
    circleAlpha: COLORS.circleAlpha,
    point: COLORS.point,
    pointAlpha: COLORS.pointAlpha,
  },
  luminous: {
    background: 0x000000,
    line: 0xffffff,
    lineAlpha: 0.5,
    circle: 0xffffff,
    circleAlpha: 0.55,
    point: 0xffffff,
    pointAlpha: 0.8,
  },
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
  /** Colours and opacities (takes effect on the next sync). */
  setStyle(style: LayerStyle): void
  /**
   * Mathematical Microscope: records before `startIndex` are context for a step range and are
   * drawn at `alpha` times their usual opacity (0 = hidden). startIndex 0 = no range.
   */
  setContext(startIndex: number, alpha: number): void
  /** Camera zoom changed within the bucket (pixel-size dependent parameters). */
  setPixelScale(pxPerUnit: number): void
  clear(): void
  destroy(): void
}
