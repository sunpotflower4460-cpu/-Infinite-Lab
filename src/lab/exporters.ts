import { KIND } from '../geometry/batch'
import type { GeometryStore } from '../geometry/GeometryStore'
import { COLORS } from '../renderer/layers/GeometryLayer'

/** Shortest decimal that round-trips to the same float64 (exact, never rounded for display). */
const num = (x: number) => (Object.is(x, -0) ? '-0' : String(x))
const KIND_NAME: Record<number, string> = {
  [KIND.point]: 'point',
  [KIND.circle]: 'circle',
  [KIND.line]: 'line',
  [KIND.arc]: 'arc',
}
const ROWS_PER_PART = 10_000

export const CSV_HEADER = 'step,kind,x,y,radius,x2,y2,start_angle,end_angle'

/**
 * Geometry as CSV (spec §28): one row per record, exact float64 values.
 * Returned as string parts so large exports can go straight into a Blob.
 */
export function geometryCsv(store: GeometryStore, count: number): string[] {
  const parts: string[] = [CSV_HEADER + '\n']
  let rows: string[] = []
  store.forEachRecord(count, (d, o) => {
    const kind = d[o]!
    const [a, b, c, e, f] = [d[o + 2]!, d[o + 3]!, d[o + 4]!, d[o + 5]!, d[o + 6]!]
    let fields: string[]
    if (kind === KIND.line) fields = [num(a), num(b), '', num(c), num(e), '', '']
    else if (kind === KIND.circle) fields = [num(a), num(b), num(c), '', '', '', '']
    else if (kind === KIND.arc) fields = [num(a), num(b), num(c), '', '', num(e), num(f)]
    else fields = [num(a), num(b), '', '', '', '', '']
    rows.push(`${num(d[o + 1]!)},${KIND_NAME[kind]},${fields.join(',')}`)
    if (rows.length === ROWS_PER_PART) {
      parts.push(rows.join('\n') + '\n')
      rows = []
    }
  })
  if (rows.length) parts.push(rows.join('\n') + '\n')
  return parts
}

const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`
const escapeXml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/**
 * Geometry as SVG in world coordinates (y up, via a flipped group), exact float64 values,
 * 1 px non-scaling strokes. `description` (rule, config) is embedded as <desc>.
 */
export function geometrySvg(
  store: GeometryStore,
  count: number,
  title: string,
  description: string,
): string[] {
  const b = store.boundsUpTo(count) ?? { minX: -1, minY: -1, maxX: 1, maxY: 1 }
  const w = Math.max(b.maxX - b.minX, 1e-9)
  const h = Math.max(b.maxY - b.minY, 1e-9)
  const pad = Math.max(w, h) * 0.04
  const dot = Math.max(w, h) * 0.0015
  const vb = [b.minX - pad, -(b.maxY + pad), w + 2 * pad, h + 2 * pad].map(num).join(' ')
  const parts: string[] = [
    `<?xml version="1.0" encoding="UTF-8"?>\n`,
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" width="1200" height="${Math.round((1200 * (h + 2 * pad)) / (w + 2 * pad))}">\n`,
    `<title>${escapeXml(title)}</title>\n<desc>${escapeXml(description)}</desc>\n`,
    `<rect x="${num(b.minX - pad)}" y="${num(-(b.maxY + pad))}" width="${num(w + 2 * pad)}" height="${num(h + 2 * pad)}" fill="${hex(COLORS.background)}"/>\n`,
    `<g transform="scale(1,-1)" fill="none" stroke-width="1" vector-effect="non-scaling-stroke">\n`,
  ]
  let rows: string[] = []
  const lineStyle = `stroke="${hex(COLORS.line)}" stroke-opacity="${COLORS.lineAlpha}" vector-effect="non-scaling-stroke"`
  const circleStyle = `stroke="${hex(COLORS.circle)}" stroke-opacity="${COLORS.circleAlpha}" vector-effect="non-scaling-stroke"`
  const dotStyle = `fill="${hex(COLORS.point)}" fill-opacity="${COLORS.pointAlpha}"`
  store.forEachRecord(count, (d, o) => {
    const kind = d[o]
    const step = num(d[o + 1]!)
    const [a, bb, c, e, f] = [d[o + 2]!, d[o + 3]!, d[o + 4]!, d[o + 5]!, d[o + 6]!]
    if (kind === KIND.line) {
      rows.push(
        `<line data-step="${step}" x1="${num(a)}" y1="${num(bb)}" x2="${num(c)}" y2="${num(e)}" ${lineStyle}/>`,
      )
    } else if ((kind === KIND.circle && c > 0) || kind === KIND.arc) {
      if (kind === KIND.arc && Math.abs(f - e) < 2 * Math.PI) {
        const [x0, y0] = [a + c * Math.cos(e), bb + c * Math.sin(e)]
        const [x1, y1] = [a + c * Math.cos(f), bb + c * Math.sin(f)]
        const large = Math.abs(f - e) > Math.PI ? 1 : 0
        const sweep = f > e ? 1 : 0
        rows.push(
          `<path data-step="${step}" d="M ${num(x0)} ${num(y0)} A ${num(c)} ${num(c)} 0 ${large} ${sweep} ${num(x1)} ${num(y1)}" ${circleStyle}/>`,
        )
      } else {
        rows.push(`<circle data-step="${step}" cx="${num(a)}" cy="${num(bb)}" r="${num(c)}" ${circleStyle}/>`)
      }
    } else {
      rows.push(`<circle data-step="${step}" cx="${num(a)}" cy="${num(bb)}" r="${num(dot)}" ${dotStyle}/>`)
    }
    if (rows.length === ROWS_PER_PART) {
      parts.push(rows.join('\n') + '\n')
      rows = []
    }
  })
  if (rows.length) parts.push(rows.join('\n') + '\n')
  parts.push('</g>\n</svg>\n')
  return parts
}
