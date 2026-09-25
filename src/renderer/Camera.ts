/**
 * 2D camera: world (float64, y up) ↔ screen (CSS pixels, y down).
 * The mathematical state is never modified by the camera; it only maps coordinates.
 */
export interface Bounds {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

export interface Point {
  x: number
  y: number
}

export const MIN_ZOOM = 1e-4
export const MAX_ZOOM = 1e5

export class Camera {
  /** World point at the centre of the screen. */
  cx = 0
  cy = 0
  /** Screen pixels per world unit. */
  zoom = 4
  width = 1
  height = 1

  setViewport(width: number, height: number): void {
    this.width = Math.max(1, width)
    this.height = Math.max(1, height)
  }

  worldToScreen(x: number, y: number): [number, number] {
    return [(x - this.cx) * this.zoom + this.width / 2, -(y - this.cy) * this.zoom + this.height / 2]
  }

  screenToWorld(sx: number, sy: number): [number, number] {
    return [this.cx + (sx - this.width / 2) / this.zoom, this.cy - (sy - this.height / 2) / this.zoom]
  }

  /** Zoom by `factor`, keeping the world point under screen point (sx, sy) fixed. */
  zoomAt(sx: number, sy: number, factor: number): void {
    const [wx, wy] = this.screenToWorld(sx, sy)
    this.zoom = clamp(this.zoom * factor, MIN_ZOOM, MAX_ZOOM)
    this.cx = wx - (sx - this.width / 2) / this.zoom
    this.cy = wy + (sy - this.height / 2) / this.zoom
  }

  panBy(dxScreen: number, dyScreen: number): void {
    this.cx -= dxScreen / this.zoom
    this.cy += dyScreen / this.zoom
  }

  /**
   * Two-finger gesture from (a0, b0) to (a1, b1), screen coordinates: zoom by the change in
   * finger distance and pan with the midpoint, so the world point under the fingers stays there.
   */
  pinch(a0: Point, b0: Point, a1: Point, b1: Point): void {
    const m0x = (a0.x + b0.x) / 2
    const m0y = (a0.y + b0.y) / 2
    const d0 = Math.hypot(a0.x - b0.x, a0.y - b0.y)
    const d1 = Math.hypot(a1.x - b1.x, a1.y - b1.y)
    if (d0 > 0 && d1 > 0) this.zoomAt(m0x, m0y, d1 / d0)
    this.panBy((a1.x + b1.x) / 2 - m0x, (a1.y + b1.y) / 2 - m0y)
  }

  centerOn(x: number, y: number): void {
    this.cx = x
    this.cy = y
  }

  fit(b: Bounds, paddingPx = 40): void {
    const w = Math.max(b.maxX - b.minX, 1e-9)
    const h = Math.max(b.maxY - b.minY, 1e-9)
    this.cx = (b.minX + b.maxX) / 2
    this.cy = (b.minY + b.maxY) / 2
    const availW = Math.max(this.width - 2 * paddingPx, 1)
    const availH = Math.max(this.height - 2 * paddingPx, 1)
    this.zoom = clamp(Math.min(availW / w, availH / h), MIN_ZOOM, MAX_ZOOM)
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v))
}
