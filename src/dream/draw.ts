import {
  DREAM_COMMIT,
  PHASES,
  phaseIndex,
  relationNames,
  selectedCandidate,
  type Decision,
  type Entity,
  type MeaningGraph,
  type Scenario,
  type View,
} from './model'

export interface Scene {
  view: View
  graph: MeaningGraph
  scenario: Scenario
  decision: Decision
  progress: number
}
const C = {
  bg: '#060b16',
  text: '#e2eaf9',
  muted: '#a2b1c9',
  line: '#2c405b',
  active: '#7edee5',
  chosen: '#ffd18a',
  pending: '#c5acf1',
  red: '#ff8897',
}
const font = '"Noto Sans CJK JP", "Hiragino Sans", system-ui, sans-serif'
const clamp = (x: number) => Math.min(1, Math.max(0, x))
const ease = (x: number) => {
  const t = clamp(x)
  return t * t * (3 - 2 * t)
}
interface Point {
  x: number
  y: number
}

function text(
  ctx: CanvasRenderingContext2D,
  value: string,
  x: number,
  y: number,
  size = 14,
  color = C.text,
  align: CanvasTextAlign = 'center',
  maxWidth?: number,
) {
  ctx.font = `500 ${size}px ${font}`
  ctx.fillStyle = color
  ctx.textAlign = align
  ctx.textBaseline = 'middle'
  if (maxWidth) ctx.fillText(value, x, y, maxWidth)
  else ctx.fillText(value, x, y)
}
function wrapped(
  ctx: CanvasRenderingContext2D,
  value: string,
  x: number,
  y: number,
  maxWidth: number,
  size = 14,
  color = C.text,
  maxLines = 3,
) {
  ctx.font = `500 ${size}px ${font}`
  const lines: string[] = []
  let line = ''
  for (const c of value) {
    if (ctx.measureText(line + c).width > maxWidth && line) {
      lines.push(line)
      line = c
    } else line += c
  }
  if (line) lines.push(line)
  const visible = lines.slice(0, maxLines)
  if (lines.length > maxLines) visible[maxLines - 1] = visible[maxLines - 1]!.slice(0, -1) + '…'
  visible.forEach((s, i) => text(ctx, s, x, y + (i - (visible.length - 1) / 2) * size * 1.5, size, color))
}
function dot(ctx: CanvasRenderingContext2D, p: Point, r: number, color: string, glow = false) {
  ctx.save()
  if (glow) {
    ctx.shadowColor = color
    ctx.shadowBlur = 20
  }
  ctx.beginPath()
  ctx.arc(p.x, p.y, r, 0, 2 * Math.PI)
  ctx.fillStyle = color
  ctx.fill()
  ctx.restore()
}
function node(ctx: CanvasRenderingContext2D, p: Point, r: number, color: string, active = false) {
  ctx.save()
  const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 1.7)
  g.addColorStop(0, `${color}18`)
  g.addColorStop(1, `${color}00`)
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(p.x, p.y, r * 1.7, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#0c1829'
  ctx.strokeStyle = color
  ctx.lineWidth = active ? 1.7 : 1
  ctx.beginPath()
  ctx.arc(p.x, p.y, r, 0, Math.PI * 2)
  ctx.fill()
  ctx.stroke()
  ctx.restore()
}
function edge(
  ctx: CanvasRenderingContext2D,
  a: Point,
  b: Point,
  amount: number,
  color: string,
  dashed = false,
  pulse = 0,
) {
  const f = ease(amount)
  if (!f) return
  ctx.save()
  ctx.strokeStyle = color
  ctx.lineWidth = 1.4
  if (dashed) ctx.setLineDash([4, 5])
  ctx.beginPath()
  ctx.moveTo(a.x, a.y)
  ctx.lineTo(a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f)
  ctx.stroke()
  ctx.setLineDash([])
  const p = { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f }
  if (f < 1) dot(ctx, p, 3.3, color, true)
  else if (pulse > 0)
    dot(ctx, { x: a.x + (b.x - a.x) * pulse, y: a.y + (b.y - a.y) * pulse }, 3.3, color, true)
  ctx.restore()
}
function header(ctx: CanvasRenderingContext2D, width: number, scene: Scene) {
  const small = width < 600,
    pad = small ? 18 : 32
  text(
    ctx,
    scene.view === 'meaning' ? '01 / MEANING ATLAS' : '02 / DREAM-BOX EXECUTION',
    pad,
    27,
    11,
    C.active,
    'left',
  )
  const title =
    scene.view === 'meaning' ? `「${scene.graph.query.word || '…'}」から広がる意味` : scene.scenario.title
  text(ctx, title, pad, 57, small ? 19 : 25, C.text, 'left', width - pad * 2)
  const subtitle =
    scene.view === 'meaning'
      ? '登録された関係をたどる概念モデル'
      : `固定実行の再生 / main ${DREAM_COMMIT.slice(0, 7)}`
  text(ctx, subtitle, pad, 86, 12, C.muted, 'left')
  if (scene.view === 'implementation' && scene.decision.choice && scene.progress > 0.65)
    text(
      ctx,
      `ユーザーが選択：${selectedCandidate(scene.decision)?.label || ''}`,
      pad,
      110,
      11,
      C.chosen,
      'left',
      width - pad * 2,
    )
}

function meaning(ctx: CanvasRenderingContext2D, w: number, h: number, scene: Scene) {
  const { graph, progress: t } = scene,
    mobile = w < 600
  const center = { x: w / 2, y: h * (mobile ? 0.43 : 0.46) }
  const r = Math.min(w * (mobile ? 0.32 : 0.29), (h - 220) * 0.37)
  const coreR = mobile ? 38 : 44
  const root = graph.concepts[0]?.id || 'word'
  const first = graph.nodes.filter((n) => n.depth === 1)
  const positions = new Map<string, Point>([
    [root, center],
    ['word', center],
  ])
  first.forEach((n, i) => {
    const angle = -Math.PI / 2 + (i / first.length) * Math.PI * 2
    positions.set(n.id, { x: center.x + Math.cos(angle) * r, y: center.y + Math.sin(angle) * r })
    const children = graph.nodes.filter((c) => c.parent === n.id)
    children.forEach((child, j) => {
      const a = angle + (j - (children.length - 1) / 2) * 0.55
      positions.set(
        child.id,
        Math.abs(Math.cos(angle)) < 0.4
          ? {
              x: center.x + r * (j % 2 ? -1.2 : 1.2),
              y: center.y + Math.sin(angle) * r,
            }
          : { x: center.x + Math.cos(a) * r * 1.75, y: center.y + Math.sin(a) * r * 1.65 },
      )
    })
  })
  // On a narrow screen, put the second hop in two rows below the radial
  // first hop. No concept label extends beyond the visible canvas.
  if (mobile) {
    const second = graph.nodes
      .filter((n) => n.depth === 2)
      .sort((a, b) => (positions.get(a.parent)?.x || 0) - (positions.get(b.parent)?.x || 0))
    second.forEach((n, i) =>
      positions.set(n.id, {
        x: w * (i % 2 ? 0.75 : 0.25),
        y: second.length > 2 ? h * 0.66 + Math.floor(i / 2) * 48 : h * 0.7,
      }),
    )
  }
  ctx.save()
  ctx.strokeStyle = '#182a40'
  ctx.lineWidth = 0.8
  for (const scale of mobile ? [1] : [1, 1.7]) {
    ctx.beginPath()
    ctx.ellipse(center.x, center.y, r * scale, r * scale, 0, 0, Math.PI * 2)
    ctx.stroke()
  }
  ctx.restore()
  for (const n of graph.nodes) {
    const p = positions.get(n.id),
      parent = positions.get(n.parent)
    if (!p || !parent) continue
    const amount = (t - (n.depth === 1 ? 0.18 : 0.35)) / 0.2
    const focus = t >= 0.65 && graph.selected !== null
    const chosen = graph.selected === n.id
    const color = chosen && focus ? C.chosen : n.status === 'PENDING' || n.negated ? C.pending : C.active
    ctx.save()
    ctx.globalAlpha = focus && !chosen ? 0.6 : 1
    edge(
      ctx,
      parent,
      p,
      amount,
      color,
      n.status === 'PENDING' || n.negated,
      chosen && t > 0.8 && t < 1 ? (t - 0.8) / 0.2 : 0,
    )
    if (amount > 0.55) {
      const alpha = ease((amount - 0.55) / 0.45)
      ctx.globalAlpha *= alpha
      const mid = { x: parent.x + (p.x - parent.x) * 0.53, y: parent.y + (p.y - parent.y) * 0.53 }
      text(ctx, relationNames[n.type] || n.type, mid.x, mid.y - 8, 11, C.muted)
      dot(ctx, p, chosen && focus ? 6 : 4, color, chosen && focus)
      const labelY = p.y + (p.y < center.y - r * 0.6 ? -20 : 20)
      wrapped(
        ctx,
        n.label,
        p.x,
        labelY,
        mobile ? 110 : 150,
        mobile ? 12 : 15,
        chosen && focus ? C.chosen : C.text,
        2,
      )
      if (n.negated) text(ctx, '否定の関係', p.x, labelY + 20, 11, C.pending)
      else if (n.status === 'PENDING') text(ctx, '条件待ち', p.x, labelY + 20, 11, C.pending)
      if (chosen && focus) text(ctx, 'SELECTED', p.x, labelY + 23, 10, C.chosen)
    }
    ctx.restore()
  }
  node(ctx, center, coreR, C.active, true)
  wrapped(ctx, graph.query.word || '言葉', center.x, center.y, coreR * 1.7, mobile ? 12 : 14)
  if (!first.length && t > 0.4)
    text(ctx, 'つながる登録概念がありません', center.x, center.y + coreR + 38, 13, C.pending)
  if (t >= 0.65) {
    const hint =
      graph.status === 'selected'
        ? `観点「${relationNames[graph.query.focus]}」で選択`
        : graph.status === 'unknown'
          ? '未登録 → 説明を待つ'
          : graph.status === 'ambiguous'
            ? '一意に決まらない → 確認を待つ'
            : graph.status === 'pending'
              ? '条件がそろうまで選ばない'
              : 'この観点で選べる登録関係がない'
    text(ctx, hint, w / 2, h - 118, mobile ? 12 : 15, graph.selected ? C.chosen : C.pending)
  }
  text(
    ctx,
    '線は登録関係。距離・角度は表示用で、意味の近さを表しません。',
    w / 2,
    h - 88,
    mobile ? 10 : 12,
    C.muted,
  )
}

/** Small isometric projection of the recorded physical parts. Positions, sizes,
 * colors and IDs come from the source run; this is not a second physics solver.
 */
function world(ctx: CanvasRenderingContext2D, entities: Entity[], x: number, y: number, span: number) {
  const targets = entities.filter(
    (e) => e.parts.length && !['player', 'enemy', 'tree', 'rock'].includes(e.kind),
  )
  const scale = span / 7
  const project = (px: number, py: number, pz: number) => ({
    x: x + (px - pz) * scale * 0.7,
    y: y + (px + pz) * scale * 0.28 - py * scale,
  })
  ctx.save()
  ctx.strokeStyle = C.line
  ctx.lineWidth = 0.7
  for (let i = -3; i <= 3; i++) {
    for (const [a, b] of [
      [project(i, 0, -3), project(i, 0, 3)],
      [project(-3, 0, i), project(3, 0, i)],
    ]) {
      ctx.beginPath()
      ctx.moveTo(a!.x, a!.y)
      ctx.lineTo(b!.x, b!.y)
      ctx.stroke()
    }
  }
  for (const e of [...targets].sort((a, b) => a.pos.z + a.pos.x - b.pos.z - b.pos.x)) {
    const part = e.parts[0]!,
      p = e.pos,
      size = part.size
    const color = part.material.color || '#ba8550'
    if (part.shape === 'ball') {
      const point = project(p.x, p.y + (size[1] || 1) / 2, p.z)
      dot(ctx, point, (size[0] || 0.5) * scale * 0.5, color)
    } else {
      const sx = (size[0] || 1) / 2,
        sy = size[1] || 1,
        sz = (size[2] || 1) / 2
      const vertices = [
        [-sx, 0, -sz],
        [sx, 0, -sz],
        [sx, 0, sz],
        [-sx, 0, sz],
        [-sx, sy, -sz],
        [sx, sy, -sz],
        [sx, sy, sz],
        [-sx, sy, sz],
      ].map((v) => project(p.x + v[0]!, p.y + v[1]!, p.z + v[2]!))
      for (const [face, alpha] of [
        [[1, 2, 6, 5], 0.55],
        [[2, 3, 7, 6], 0.8],
        [[4, 5, 6, 7], 1],
      ] as const) {
        ctx.globalAlpha = alpha
        ctx.fillStyle = color
        ctx.strokeStyle = '#dce5f74a'
        ctx.beginPath()
        face.forEach((id, i) => {
          const a = vertices[id]!
          if (i) ctx.lineTo(a.x, a.y)
          else ctx.moveTo(a.x, a.y)
        })
        ctx.closePath()
        ctx.fill()
        ctx.stroke()
      }
    }
    ctx.globalAlpha = 1
  }
  if (targets.length) text(ctx, targets.map((e) => e.id).join(' / '), x, y + 47, 10, C.muted)
  if (!targets.length) text(ctx, '追加物体なし', x, y, 12, C.muted)
  ctx.restore()
}

function implementation(ctx: CanvasRenderingContext2D, w: number, h: number, scene: Scene) {
  const { scenario: s, decision: d, progress: t } = scene,
    mobile = w < 700
  const candidates = d.understanding.candidates
  const chosen = d.understanding.selectedCandidateId
  const applied = !!d.outcome.applied
  const r = mobile ? 25 : 33
  const input = { x: w * (mobile ? 0.22 : 0.13), y: h * (mobile ? 0.27 : 0.46) }
  const grammar = { x: w * (mobile ? 0.67 : 0.33), y: input.y }
  const gate = { x: w * (mobile ? 0.2 : 0.76), y: h * (mobile ? 0.71 : 0.46) }
  const output = { x: w * (mobile ? 0.8 : 0.91), y: gate.y }
  const ys =
    candidates.length > 1
      ? candidates.map((_, i) =>
          mobile
            ? h * 0.45 + i * 46
            : h * 0.27 + i * Math.min(72, (h * 0.36) / Math.max(1, candidates.length - 1)),
        )
      : [h * (mobile ? 0.46 : 0.46)]
  const points = candidates.map((_, i) => ({ x: w * (mobile ? 0.49 : 0.55), y: ys[i]! }))
  edge(ctx, input, grammar, (t - 0.12) / 0.13, C.active)
  candidates.forEach((c, i) => {
    const selected = chosen === c.id && t > 0.65
    const amount = (t - 0.35 - i * 0.025) / 0.15
    ctx.save()
    ctx.globalAlpha = t > 0.65 && chosen && !selected ? 0.3 : 1
    edge(ctx, grammar, points[i]!, amount, selected ? C.chosen : C.active)
    if (selected || (t > 0.6 && !chosen))
      edge(ctx, points[i]!, gate, (t - 0.65) / 0.12, selected ? C.chosen : C.pending, !selected)
    if (amount > 0.6) {
      const p = points[i]!
      ctx.fillStyle = '#0b1728'
      ctx.strokeStyle = selected ? C.chosen : C.line
      ctx.beginPath()
      ctx.roundRect(p.x - (mobile ? 55 : 66), p.y - 20, mobile ? 110 : 132, 40, 7)
      ctx.fill()
      ctx.stroke()
      const label =
        s.id === 'create'
          ? '箱 × 3 / 木材'
          : s.id === 'unknown'
            ? '未解決の言葉'
            : s.id === 'taught'
              ? '定義＋保留の続き'
              : s.id === 'reference'
                ? `「それ」→ ${c.bindings.join('・')}`
                : c.label
      text(ctx, label, p.x, p.y, mobile ? 11 : 12, selected ? C.chosen : C.text, 'center', mobile ? 100 : 125)
    }
    ctx.restore()
  })
  if (t > 0.8 && applied)
    edge(ctx, gate, output, (t - 0.8) / 0.1, C.chosen, false, t < 1 ? (t - 0.8) / 0.2 : 0)
  node(ctx, input, r, C.active)
  text(ctx, '原文', input.x, input.y, 13)
  wrapped(ctx, s.text, input.x, input.y + r + 28, mobile ? 120 : 180, mobile ? 12 : 14)
  if (t > 0.18) {
    node(ctx, grammar, r, C.active)
    text(ctx, '文法', grammar.x, grammar.y - 7, 13)
    text(ctx, '＋参照', grammar.x, grammar.y + 10, 11)
    const desc =
      s.id === 'reference'
        ? 'それ → box7 / 8 / 9'
        : s.id === 'unknown'
          ? '星のたね：未登録'
          : s.id === 'taught'
            ? '明示的な定義'
            : s.tokens.map((t) => t.surface).join(' / ')
    wrapped(ctx, desc, grammar.x, grammar.y + r + 28, mobile ? 125 : 175, 11, C.muted, 2)
  }
  if (t > 0.6) {
    node(ctx, gate, r, applied && t > 0.8 ? C.chosen : C.pending)
    text(ctx, applied ? '確認' : '保留', gate.x, gate.y, 13, applied ? C.chosen : C.pending)
    const caption = applied
      ? chosen
        ? '選択済み・実行可能'
        : '実行可能'
      : s.id === 'unknown'
        ? '説明を待つ'
        : '対象を選ぶまで実行しない'
    wrapped(ctx, caption, gate.x, gate.y + r + 26, mobile ? 130 : 160, 11, applied ? C.chosen : C.pending)
  }
  if (t > 0.8) {
    world(ctx, applied ? d.after : s.before, output.x, output.y + 10, mobile ? 92 : Math.min(138, w * 0.13))
    text(
      ctx,
      applied ? '反映後の実状態' : '世界はそのまま',
      output.x,
      output.y + (mobile ? -54 : 89),
      11,
      applied ? C.chosen : C.muted,
    )
  }
  const message =
    t < 0.65
      ? `${candidates.length} 個の解釈候補を構成`
      : applied
        ? s.id === 'taught'
          ? '説明が成立 → 元の指示を再開 → 球が 1 個できる'
          : s.id === 'create'
            ? '明示された 3 個を、そのまま実行'
            : `確認された ${selectedCandidate(d)?.bindings.join('・') || '対象'} にだけ反映`
        : s.id === 'unknown'
          ? '未知の形を推測せず、原文を保留する'
          : '候補はあっても、未選択なら実行しない'
  wrapped(ctx, message, w / 2, h - 95, w - 32, mobile ? 12 : 16, applied && t > 0.8 ? C.chosen : C.text, 2)
}

export function drawScene(ctx: CanvasRenderingContext2D, width: number, height: number, scene: Scene): void {
  ctx.save()
  ctx.clearRect(0, 0, width, height)
  ctx.fillStyle = C.bg
  ctx.fillRect(0, 0, width, height)
  const glow = ctx.createRadialGradient(
    width * 0.5,
    height * 0.45,
    10,
    width * 0.5,
    height * 0.45,
    width * 0.7,
  )
  glow.addColorStop(0, '#102c433f')
  glow.addColorStop(1, '#060b1600')
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, width, height)
  header(ctx, width, scene)
  if (scene.view === 'meaning') meaning(ctx, width, height, scene)
  else implementation(ctx, width, height, scene)
  const p = clamp(scene.progress),
    index = phaseIndex(p),
    pad = width < 600 ? 18 : 32
  ctx.fillStyle = '#1e3045'
  ctx.fillRect(pad, height - 54, width - pad * 2, 2)
  ctx.fillStyle = C.active
  ctx.fillRect(pad, height - 54, (width - pad * 2) * p, 2)
  const actualLabel =
    scene.view === 'implementation' && index === 4 && !scene.decision.outcome.applied
      ? '実行せず、説明・確認を待つ'
      : scene.view === 'meaning' && index === 4 && !scene.graph.selected
        ? '一意に決まらず、選択を待つ'
        : PHASES[scene.view][index]!
  text(
    ctx,
    `${String(index + 1).padStart(2, '0')} / ${actualLabel}`,
    pad,
    height - 30,
    width < 600 ? 11 : 13,
    C.text,
    'left',
    width - pad * 2,
  )
  if (width >= 600) text(ctx, '説明用の時間軸', width - pad, height - 30, 10, C.muted, 'right')
  ctx.restore()
}
