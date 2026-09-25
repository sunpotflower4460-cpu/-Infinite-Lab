/** World-space distance helpers for picking (no rendering dependencies). */
/** Distance from p to the segment (x1,y1)–(x2,y2). */
export function segmentDistance(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): number {
  const dx = x2 - x1
  const dy = y2 - y1
  const len2 = dx * dx + dy * dy
  const t = len2 > 0 ? Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / len2)) : 0
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy))
}

const TAU = 2 * Math.PI

/** Distance to the arc from `start` counter-clockwise through `sweep` (0…2π), or to its nearer end. */
export function arcDistance(
  px: number,
  py: number,
  cx: number,
  cy: number,
  r: number,
  start: number,
  sweep: number,
): number {
  const radial = Math.abs(Math.hypot(px - cx, py - cy) - r)
  if (sweep >= TAU) return radial
  const rel = (((Math.atan2(py - cy, px - cx) - start) % TAU) + TAU) % TAU
  if (rel <= sweep) return radial
  const end = start + sweep
  const d1 = Math.hypot(px - (cx + r * Math.cos(start)), py - (cy + r * Math.sin(start)))
  const d2 = Math.hypot(px - (cx + r * Math.cos(end)), py - (cy + r * Math.sin(end)))
  return Math.min(d1, d2)
}
