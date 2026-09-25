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
export interface ArcInstruction {
  type: 'arc'
  x: number
  y: number
  radius: number
  startAngle: number
  endAngle: number
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
  endAngle: number,
): ArcInstruction => ({
  type: 'arc',
  x,
  y,
  radius,
  startAngle,
  endAngle,
})
