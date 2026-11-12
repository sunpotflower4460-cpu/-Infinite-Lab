/** View-only transformations: never inserted in GeometryStore or geometrySha256. */
export type OverlayMode = 'solo' | 'mirror' | 'yin-yang'
export type Flow = 'original' | 'derived'
export interface Camera3DView {
  projection?: 'perspective' | 'orthographic'
  zoom?: number
  position: [number, number, number]
  target: [number, number, number]
}
export interface Presentation {
  mode: OverlayMode
  trail: number // 0 = all history
  palette: 'ivory-slate' | 'gold-blue' | 'jade-rose'
  opacity: number
  width: number
  glow: number
  flow: 'both' | Flow
  look: 'lab' | 'luminous'
  camera?: Camera3DView
  camera2d?: { cx: number; cy: number; zoom: number }
  autoRotate: boolean
}
export const DEFAULT_PRESENTATION: Presentation = {
  mode: 'solo',
  trail: 0,
  palette: 'gold-blue',
  opacity: 0.55,
  width: 1,
  glow: 0.3,
  flow: 'both',
  look: 'lab',
  autoRotate: false,
}
export const PALETTES = {
  'ivory-slate': [0xeee8d7, 0x8798b0],
  'gold-blue': [0xe6be79, 0x83b9da],
  'jade-rose': [0x80c9b3, 0xd9a0b3],
} as const
export function flowSigns(mode: OverlayMode): [number, number, number] {
  return mode === 'mirror' ? [-1, 1, 1] : mode === 'yin-yang' ? [-1, -1, -1] : [1, 1, 1]
}
export function transformPoint(x: number, y: number, z: number, mode: OverlayMode): [number, number, number] {
  const [sx, sy, sz] = flowSigns(mode)
  return [sx * x, sy * y, sz * z]
}
export function overlayRule(mode: OverlayMode): string {
  return mode === 'mirror'
    ? '左右鏡像: P → (−x, y, z)。元の軌跡に加えた変換です。'
    : mode === 'yin-yang'
      ? '陰陽: P → (−x, −y, −z)。中心反転した対です。太極図のS字を保証しません。'
      : 'Solo: 元の数式の軌跡。πの桁ではなく、腕の回転速度比がπです。'
}
export function parsePresentation(input: unknown): Presentation {
  if (input === undefined) return { ...DEFAULT_PRESENTATION }
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('invalid presentation')
  const keys = [
    'mode',
    'trail',
    'palette',
    'opacity',
    'width',
    'glow',
    'flow',
    'look',
    'camera',
    'camera2d',
    'autoRotate',
  ]
  if (Object.keys(input).some((key) => !keys.includes(key))) throw new Error('unknown presentation setting')
  const p = { ...DEFAULT_PRESENTATION, ...input } as Presentation
  if (
    !['solo', 'mirror', 'yin-yang'].includes(p.mode) ||
    !Object.hasOwn(PALETTES, p.palette) ||
    !['both', 'original', 'derived'].includes(p.flow) ||
    !['lab', 'luminous'].includes(p.look) ||
    typeof p.autoRotate !== 'boolean'
  )
    throw new Error('invalid presentation mode')
  for (const [v, lo, hi] of [
    [p.trail, 0, 1e6],
    [p.opacity, 0.05, 1],
    [p.width, 0.5, 4],
    [p.glow, 0, 1],
  ]) {
    if (!Number.isFinite(v) || v! < lo! || v! > hi!) throw new Error('invalid presentation range')
  }
  if (!Number.isInteger(p.trail)) throw new Error('invalid trail')
  const vec = (v: unknown): v is [number, number, number] =>
    Array.isArray(v) &&
    v.length === 3 &&
    v.every((x) => typeof x === 'number' && Number.isFinite(x) && Math.abs(x) < 1e12)
  if (
    p.camera &&
    (!vec(p.camera.position) ||
      !vec(p.camera.target) ||
      Math.hypot(...p.camera.position.map((x, i) => x - p.camera!.target[i]!)) < 1e-9)
  )
    throw new Error('invalid camera')
  if (
    p.camera2d &&
    (![p.camera2d.cx, p.camera2d.cy, p.camera2d.zoom].every(Number.isFinite) ||
      p.camera2d.zoom <= 0 ||
      p.camera2d.zoom > 1e12)
  )
    throw new Error('invalid 2D camera')
  if (p.camera?.projection !== undefined && !['perspective', 'orthographic'].includes(p.camera.projection))
    throw new Error('invalid camera projection')
  if (
    p.camera?.zoom !== undefined &&
    (!Number.isFinite(p.camera.zoom) || p.camera.zoom <= 0 || p.camera.zoom > 1e12)
  )
    throw new Error('invalid camera zoom')
  return p
}
