import {
  DEFAULT_PRESENTATION,
  flowColor,
  transformFlowPoint,
  visibleFlows,
  hasThirdFlow,
  thirdRule,
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
  const [x, y, z] = transformFlowPoint(r[2]!, r[3]!, r[0] === KIND.point ? r[4]! : 0, p, flow)
  r[2] = x
  r[3] = y
  if (r[0] === KIND.point) r[4] = z
  if (r[0] === KIND.line) {
    const end = transformFlowPoint(r[4]!, r[5]!, 0, p, flow)
    r[4] = end[0]
    r[5] = end[1]
  }
  if (r[0] === KIND.arc)
    r[5] =
      flow === 'third'
        ? r[5]! + (p.thirdQuarter * Math.PI) / 2
        : p.mode === 'mirror'
          ? Math.PI - (r[5]! + r[6]!)
          : r[5]! + Math.PI
  return { d: r, o: 0 }
}
function eachFlow(
  store: GeometryStore,
  from: number,
  count: number,
  p: Presentation,
  visit: (d: Float64Array, o: number, flow: Flow) => void,
  supportsThird: boolean,
  thirdStore?: GeometryStore,
) {
  for (const flow of visibleFlows(p, supportsThird)) {
    const circle = flow === 'third' && p.thirdModel === 'circle'
    if (circle && (!thirdStore || thirdStore.count < count))
      throw new Error('Third-circle geometry is not ready')
    ;(circle ? thirdStore! : store).forEachRecordFrom(from, count, (d, o) => {
      const r = circle ? { d, o } : transformedRecord(d, o, p, flow)
      visit(r.d, r.o, flow)
    })
  }
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
  supportsThird = false,
  thirdStore?: GeometryStore,
): string[] {
  const paired = presentation.mode !== 'solo' || hasThirdFlow(presentation, supportsThird)
  const parts: string[] = [(withZ ? CSV_HEADER_3D : CSV_HEADER) + (paired ? ',flow' : '') + '\n']
  let rows: string[] = []
  eachFlow(
    store,
    from,
    count,
    presentation,
    (d, o, flow) => {
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
    },
    supportsThird,
    thirdStore,
  )
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
  supportsThird = false,
  thirdStore?: GeometryStore,
): string[] {
  const b = store.boundsBetween(from, count) ?? { minX: -1, minY: -1, maxX: 1, maxY: 1 }
  const corners = [
    [b.minX, b.minY],
    [b.minX, b.maxY],
    [b.maxX, b.minY],
    [b.maxX, b.maxY],
  ]
  for (const flow of visibleFlows(presentation, supportsThird)) {
    if (flow === 'third' && presentation.thirdModel === 'circle') {
      const q = thirdStore?.boundsBetween(from, count)
      if (q) {
        b.minX = Math.min(b.minX, q.minX)
        b.maxX = Math.max(b.maxX, q.maxX)
        b.minY = Math.min(b.minY, q.minY)
        b.maxY = Math.max(b.maxY, q.maxY)
      }
      continue
    }
    for (const [x, y] of corners) {
      const q = transformFlowPoint(x!, y!, 0, presentation, flow)
      b.minX = Math.min(b.minX, q[0])
      b.maxX = Math.max(b.maxX, q[0])
      b.minY = Math.min(b.minY, q[1])
      b.maxY = Math.max(b.maxY, q[1])
    }
  }
  description +=
    '\nSVG: orthographic (x,y) projection; camera perspective is not exported. ' +
    overlayRule(presentation.mode) +
    (hasThirdFlow(presentation, supportsThird) ? '\n' + thirdRule(presentation) : '')
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
  eachFlow(
    store,
    from,
    count,
    presentation,
    (d, o, flow) => {
      const kind = d[o]
      const tipOnly = flow === 'third' && presentation.thirdModel === 'circle' && !presentation.thirdTrace
      if (tipOnly && d[o + 1] !== store.stepAt(count - 1)) return
      const step = num(d[o + 1]!)
      const color = flowColor(presentation, flow)
      const alpha =
        flow === 'third'
          ? presentation.thirdOpacity *
            (presentation.thirdModel === 'circle' && presentation.thirdGuides ? 0.3 : 1)
          : presentation.opacity
      const lineStyle =
        presentation.mode === 'solo' && flow !== 'third'
          ? legacyLineStyle
          : `stroke="${hex(color)}" stroke-opacity="${alpha}" stroke-width="${presentation.width}" vector-effect="non-scaling-stroke"`
      rows.push(`<g data-flow="${flow}">`)
      const [a, bb, c, e, f] = [d[o + 2]!, d[o + 3]!, d[o + 4]!, d[o + 5]!, d[o + 6]!]
      if (kind === KIND.point && connectedPoints && !tipOnly) {
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
          rows.push(
            `<circle data-step="${step}" cx="${num(a)}" cy="${num(bb)}" r="${num(c)}" ${circleStyle}/>`,
          )
        }
      } else {
        rows.push(
          `<circle data-step="${step}" cx="${num(a)}" cy="${num(bb)}" r="${num(dot)}" ${flow === 'third' ? `fill="${hex(color)}" fill-opacity="${alpha}"` : dotStyle}/>`,
        )
      }
      rows.push('</g>')
      if (rows.length >= ROWS_PER_PART) {
        parts.push(rows.join('\n') + '\n')
        rows = []
      }
    },
    supportsThird,
    thirdStore,
  )
  if (rows.length) parts.push(rows.join('\n') + '\n')
  parts.push('</g>\n</svg>\n')
  return parts
}
