/** Keeps the original store/digest intact. The optional third circle has a separate derived store/digest. */
export type OverlayMode = 'solo' | 'mirror' | 'yin-yang'
export type Flow = 'original' | 'derived' | 'third'
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
  thirdFlow: boolean
  thirdModel: 'circle' | 'phase'
  thirdRadius: number
  thirdGuides: boolean
  thirdTrace: boolean
  thirdOpacity: number
  thirdQuarter: 1 | -1
  torusSurface: boolean
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
  thirdFlow: false,
  thirdModel: 'circle',
  thirdRadius: 1,
  thirdGuides: true,
  thirdTrace: false,
  thirdOpacity: 0.65,
  thirdQuarter: 1,
  torusSurface: false,
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
    'thirdFlow',
    'thirdModel',
    'thirdRadius',
    'thirdGuides',
    'thirdTrace',
    'thirdOpacity',
    'thirdQuarter',
    'torusSurface',
  ]
  if (Object.keys(input).some((key) => !keys.includes(key))) throw new Error('unknown presentation setting')
  const p = { ...DEFAULT_PRESENTATION, ...input } as Presentation
  // v5 stored a phase-rotated copy. Preserve those files instead of silently changing Q.
  if (!Object.hasOwn(input, 'thirdModel') && Object.hasOwn(input, 'thirdFlow')) p.thirdModel = 'phase'
  if (
    !['solo', 'mirror', 'yin-yang'].includes(p.mode) ||
    !Object.hasOwn(PALETTES, p.palette) ||
    !['both', 'original', 'derived', 'third'].includes(p.flow) ||
    !['lab', 'luminous'].includes(p.look) ||
    typeof p.autoRotate !== 'boolean' ||
    typeof p.thirdFlow !== 'boolean' ||
    !['circle', 'phase'].includes(p.thirdModel) ||
    typeof p.thirdGuides !== 'boolean' ||
    typeof p.thirdTrace !== 'boolean' ||
    typeof p.torusSurface !== 'boolean' ||
    ![1, -1].includes(p.thirdQuarter)
  )
    throw new Error('invalid presentation mode')
  for (const [v, lo, hi] of [
    [p.thirdOpacity, 0, 1],
    [p.thirdRadius, 0, 3],
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

/** View transforms only. The legacy phase model rotates P by a quarter-turn.
 * A real third circle supplies independently computed Q coordinates; its view transform is identity.
 */
export function transformFlowPoint(
  x: number,
  y: number,
  z: number,
  p: Presentation,
  flow: Flow,
): [number, number, number] {
  if (flow === 'third')
    return p.thirdModel === 'phase' ? [-p.thirdQuarter * y, p.thirdQuarter * x, z] : [x, y, z]
  return flow === 'derived' ? transformPoint(x, y, z, p.mode) : [x, y, z]
}
export function inverseFlowPoint(
  x: number,
  y: number,
  z: number,
  p: Presentation,
  flow: Flow,
): [number, number, number] {
  return flow === 'third' && p.thirdModel === 'phase'
    ? [p.thirdQuarter * y, -p.thirdQuarter * x, z]
    : transformFlowPoint(x, y, z, p, flow)
}
export function hasThirdFlow(p: Presentation, supportsThird = false): boolean {
  return supportsThird && p.thirdFlow && (p.thirdModel === 'circle' || p.mode === 'yin-yang')
}
export function visibleFlows(p: Presentation, supportsThird = false): Flow[] {
  const available: Flow[] = p.mode === 'solo' ? ['original'] : ['original', 'derived']
  if (hasThirdFlow(p, supportsThird)) available.push('third')
  // A stored single-flow filter can outlive a view switch; show available curves then.
  return p.flow === 'both' || !available.includes(p.flow) ? available : [p.flow]
}
/** qx=a·x+b·y, qy=c·x+d·y, qz=e·z. Used by GPU object transforms. */
export function flowAxes(p: Presentation, flow: Flow): [number, number, number, number, number] {
  if (flow === 'third')
    return p.thirdModel === 'phase' ? [0, -p.thirdQuarter, p.thirdQuarter, 0, 1] : [1, 0, 0, 1, 1]
  const [x, y, z] = flow === 'derived' ? flowSigns(p.mode) : [1, 1, 1]
  return [x!, 0, 0, y!, z!]
}
const THIRD_COLORS: Record<Presentation['palette'], number> = {
  'ivory-slate': 0xa9c7e8,
  'gold-blue': 0xcbb0ed,
  'jade-rose': 0xe4c27e,
}
export function flowColor(p: Presentation, flow: Flow): number {
  return flow === 'third' ? THIRD_COLORS[p.palette] : PALETTES[p.palette][flow === 'derived' ? 1 : 0]
}
export function thirdRule(p: Presentation): string {
  if (p.thirdModel === 'circle')
    return '第3の円: 速度比 1:C:C²（πでは1:π:π²）。元Pを中心に、第2の円に直交する円を追加。Qは元トーラスの内外を通ります。'
  return p.thirdQuarter === 1
    ? '旧位相モデル: Q=(−y, x, z)。大円の位相を+90°ずらす規則です。'
    : '旧位相モデル: Q=(y, −x, z)。大円の位相を−90°ずらす規則です。'
}
export function flowLabel(p: Presentation, flow: Flow): string {
  if (flow === 'third') return p.thirdModel === 'circle' ? '第3円の先端 Q / third' : '第3（旧位相） / third'
  if (p.mode === 'yin-yang') return flow === 'derived' ? '陽 / derived' : '陰 / original'
  return flow === 'derived' ? '鏡像 / derived' : '元 / original'
}
