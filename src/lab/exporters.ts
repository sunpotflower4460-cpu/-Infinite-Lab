import {
  DEFAULT_PRESENTATION,
  PALETTES,
  flowSigns,
  overlayRule,
  type Presentation,
  type Flow,
} from './presentation'
import { KIND } from '../geometry/batch'
import type { GeometryStore } from '../geometry/GeometryStore'
import { COLORS } from '../renderer/layers/GeometryLayer'

function transformedRecord(
  d: Float64Array,
  o: number,
  p: Presentation,
  flow: Flow,
): { d: Float64Array; o: number } {
  if (flow === 'original') return { d, o }
  const r = d.slice(o, o + 7)
  const [sx, sy, sz] = flowSigns(p.mode)
  r[2] = r[2]! * sx
  r[3] = r[3]! * sy
  if (r[0] === KIND.point) r[4] = r[4]! * sz
  if (r[0] === KIND.line) {
    r[4] = r[4]! * sx
    r[5] = r[5]! * sy
  }
  if (r[0] === KIND.arc) r[5] = p.mode === 'mirror' ? Math.PI - (r[5]! + r[6]!) : r[5]! + Math.PI
  return { d: r, o: 0 }
}
function exportFlows(p: Presentation): Flow[] {
  return p.mode === 'solo' ? ['original'] : p.flow === 'both' ? ['original', 'derived'] : [p.flow]
}
function eachFlow(
  store: GeometryStore,
  from: number,
  count: number,
  p: Presentation,
  visit: (d: Float64Array, o: number, flow: Flow) => void,
) {
  for (const flow of exportFlows(p))
    store.forEachRecordFrom(from, count, (d, o) => {
      const r = transformedRecord(d, o, p, flow)
      visit(r.d, r.o, flow)
    })
}

/** Shortest decimal that round-trips to the same float64 (exact, never rounded for display). */
const num = (x: number) => (Object.is(x, -0) ? '-0' : String(x))
const KIND_NAME: Record<number, string> = {
  [KIND.point]: 'point',
  [KIND.circle]: 'circle',
  [KIND.line]: 'line',
  [KIND.arc]: 'arc',
}
const ROWS_PER_PART = 10_000

export const CSV_HEADER = 'step,kind,x,y,radius,x2,y2,start_angle,sweep'
/** 3D experiments add the points' z as a last column (2D exports are unchanged). */
export const CSV_HEADER_3D = CSV_HEADER + ',z'

/**
 * Geometry as CSV (spec §28): one row per record, exact float64 values.
 * Returned as string parts so large exports can go straight into a Blob.
 */
export function geometryCsv(
  store: GeometryStore,
  count: number,
  from = 0,
  withZ = false,
  presentation: Presentation = DEFAULT_PRESENTATION,
): string[] {
  const paired = presentation.mode !== 'solo'
  const parts: string[] = [(withZ ? CSV_HEADER_3D : CSV_HEADER) + (paired ? ',flow' : '') + '\n']
  let rows: string[] = []
  eachFlow(store, from, count, presentation, (d, o, flow) => {
    const kind = d[o]!
    const [a, b, c, e, f] = [d[o + 2]!, d[o + 3]!, d[o + 4]!, d[o + 5]!, d[o + 6]!]
    let fields: string[]
    if (kind === KIND.line) fields = [num(a), num(b), '', num(c), num(e), '', '']
    else if (kind === KIND.circle) fields = [num(a), num(b), num(c), '', '', '', '']
    else if (kind === KIND.arc) fields = [num(a), num(b), num(c), '', '', num(e), num(f)]
    else fields = [num(a), num(b), '', '', '', '', '']
    if (withZ) fields.push(kind === KIND.point ? num(c) : '')
    rows.push(`${num(d[o + 1]!)},${KIND_NAME[kind]},${fields.join(',')}${paired ? ',' + flow : ''}`)
    if (rows.length >= ROWS_PER_PART) {
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
  /** First record (Microscope range); records before it are left out. */
  from = 0,
  presentation: Presentation = DEFAULT_PRESENTATION,
  connectedPoints = false,
): string[] {
  const b = store.boundsBetween(from, count) ?? { minX: -1, minY: -1, maxX: 1, maxY: 1 }
  if (presentation.mode !== 'solo') {
    const [sx, sy] = flowSigns(presentation.mode)
    const [x0, x1, y0, y1] = [b.minX * sx, b.maxX * sx, b.minY * sy, b.maxY * sy]
    b.minX = Math.min(b.minX, x0, x1)
    b.maxX = Math.max(b.maxX, x0, x1)
    b.minY = Math.min(b.minY, y0, y1)
    b.maxY = Math.max(b.maxY, y0, y1)
  }
  description +=
    '\nSVG: orthographic (x,y) projection; camera perspective is not exported. ' +
    overlayRule(presentation.mode)
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
  const legacyLineStyle = `stroke="${hex(COLORS.line)}" stroke-opacity="${COLORS.lineAlpha}" vector-effect="non-scaling-stroke"`
  const circleStyle = `stroke="${hex(COLORS.circle)}" stroke-opacity="${COLORS.circleAlpha}" vector-effect="non-scaling-stroke"`
  const dotStyle = `fill="${hex(COLORS.point)}" fill-opacity="${COLORS.pointAlpha}"`
  let previous: { x: number; y: number; flow: Flow } | null = null
  eachFlow(store, from, count, presentation, (d, o, flow) => {
    const kind = d[o]
    const step = num(d[o + 1]!)
    const color = PALETTES[presentation.palette][flow === 'derived' ? 1 : 0]
    const lineStyle =
      presentation.mode === 'solo'
        ? legacyLineStyle
        : `stroke="${hex(color)}" stroke-opacity="${presentation.opacity}" stroke-width="${presentation.width}" vector-effect="non-scaling-stroke"`
    rows.push(`<g data-flow="${flow}">`)
    const [a, bb, c, e, f] = [d[o + 2]!, d[o + 3]!, d[o + 4]!, d[o + 5]!, d[o + 6]!]
    if (kind === KIND.point && connectedPoints) {
      if (previous?.flow === flow)
        rows.push(
          `<line data-step="${step}" x1="${num(previous.x)}" y1="${num(previous.y)}" x2="${num(a)}" y2="${num(bb)}" ${lineStyle}/>`,
        )
      previous = { x: a, y: bb, flow }
    } else if (kind === KIND.line) {
      rows.push(
        `<line data-step="${step}" x1="${num(a)}" y1="${num(bb)}" x2="${num(c)}" y2="${num(e)}" ${lineStyle}/>`,
      )
    } else if ((kind === KIND.circle && c > 0) || kind === KIND.arc) {
      const sweep = kind === KIND.arc ? f : 2 * Math.PI // arcs store start + sweep
      if (sweep < 2 * Math.PI) {
        const [x0, y0] = [a + c * Math.cos(e), bb + c * Math.sin(e)]
        const [x1, y1] = [a + c * Math.cos(e + sweep), bb + c * Math.sin(e + sweep)]
        const large = sweep > Math.PI ? 1 : 0
        rows.push(
          `<path data-step="${step}" d="M ${num(x0)} ${num(y0)} A ${num(c)} ${num(c)} 0 ${large} 1 ${num(x1)} ${num(y1)}" ${circleStyle}/>`,
        )
      } else {
        rows.push(`<circle data-step="${step}" cx="${num(a)}" cy="${num(bb)}" r="${num(c)}" ${circleStyle}/>`)
      }
    } else {
      rows.push(`<circle data-step="${step}" cx="${num(a)}" cy="${num(bb)}" r="${num(dot)}" ${dotStyle}/>`)
    }
    rows.push('</g>')
    if (rows.length >= ROWS_PER_PART) {
      parts.push(rows.join('\n') + '\n')
      rows = []
    }
  })
  if (rows.length) parts.push(rows.join('\n') + '\n')
  parts.push('</g>\n</svg>\n')
  return parts
}
