/**
 * Geometry instructions: the only thing the Renderer ever sees.
 * World coordinates, mathematical orientation (y axis points up), float64.
 */
export interface CircleInstruction {
  type: 'circle'
  x: number
  y: number
  radius: number
}
export interface LineInstruction {
  type: 'line'
  x1: number
  y1: number
  x2: number
  y2: number
}
export interface PointInstruction {
  type: 'point'
  x: number
  y: number
}
/**
 * Arc: starts at `startAngle` and runs counter-clockwise (mathematical orientation) through
 * `sweep` radians, 0 ≤ sweep ≤ 2π. Stored as start + sweep — never start + end — so no
 * consumer has to guess the direction or wrap-around (renderers, picking, SVG all agree).
 */
export interface ArcInstruction {
  type: 'arc'
  x: number
  y: number
  radius: number
  startAngle: number
  sweep: number
}

export const FULL_TURN = 2 * Math.PI

/** Clamp a sweep into [0, 2π] (NaN → 0). */
export function clampSweep(sweep: number): number {
  return Number.isNaN(sweep) ? 0 : Math.min(FULL_TURN, Math.max(0, sweep))
}

export type GeometryInstruction = CircleInstruction | LineInstruction | PointInstruction | ArcInstruction

export const circle = (x: number, y: number, radius: number): CircleInstruction => ({
  type: 'circle',
  x,
  y,
  radius,
})
export const line = (x1: number, y1: number, x2: number, y2: number): LineInstruction => ({
  type: 'line',
  x1,
  y1,
  x2,
  y2,
})
export const point = (x: number, y: number): PointInstruction => ({ type: 'point', x, y })
export const arc = (
  x: number,
  y: number,
  radius: number,
  startAngle: number,
  sweep: number,
): ArcInstruction => ({
  type: 'arc',
  x,
  y,
  radius,
  startAngle,
  sweep: clampSweep(sweep),
})
