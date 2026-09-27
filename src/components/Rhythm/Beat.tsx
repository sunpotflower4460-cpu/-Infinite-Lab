import { useEffect, useMemo, useRef, useState } from 'react'
import {
  cellStep,
  firstCapture,
  GOLDEN,
  phaseOf,
  runCell,
  T0,
  TAU,
  U_STAR,
  V_STAR,
} from '../../rhythm/models'
import tongues from '../../rhythm/tongues.json'
import { Dot, More, Section, Tag } from '../Golden/Sections'
import {
  BEATS,
  C_PHI,
  C_PI,
  fitCanvas,
  Pick,
  useCell,
  useFrames,
  useVisible,
  viridis,
  type BeatId,
} from './common'

const GAMMAS = [0, 0.02, 0.05, 0.1, 0.15]

const verdict = (l: { locked: boolean; p: number; q: number; rho: number }, gamma: number) =>
  gamma === 0
    ? l.locked
      ? `拍子なし。比がちょうど ${l.p}/${l.q} なので ${l.q} 拍ごとに同じ位置に戻るが、取り込まれてはいない`
      : `拍子なし。自分の速さのまま（拍子 1 回に自分が ${l.rho.toFixed(4)} 回）`
    : l.locked
      ? `${l.p}/${l.q} に取り込まれた（拍子 ${l.q} 回に自分が ${l.p} 回）`
      : `自由（拍子 1 回に自分が ${l.rho.toFixed(4)} 回）`

/**
 * Experiment B: one cell that beats by itself (FitzHugh–Nagumo, T0 = 39.49) under an outside beat.
 * The verdict is the report's protocol run on the spot; the animation shows the same cell slowly.
 */
export function OneCell() {
  const { s, beat, gamma } = useCell()
  const lock = useMemo(() => runCell(s, gamma), [s, gamma])
  const box = useRef<HTMLDivElement>(null)
  const visible = useVisible(box)
  const plane = useRef<HTMLCanvasElement>(null)
  const dial = useRef<HTMLCanvasElement>(null)
  const sim = useRef({
    u: -1,
    v: -0.5,
    t: 0,
    next: 0,
    trail: [] as number[],
    marks: [] as number[],
    beats: 0,
  })
  /** the settled loop (3 own periods after the transient), drawn faintly behind the moving point */
  const loop = useRef<number[]>([])
  const [first, setFirst] = useState<{ s: number; g: number | null } | null>(null)
  const [finding, setFinding] = useState(false)

  // restart the slow picture after the report's transient (60 T0), so it shows the settled rhythm
  useEffect(() => {
    let u = -1
    let v = -0.5
    let t = 0
    const Om = TAU / (s * T0)
    while (t < 60 * T0) {
      ;[u, v] = cellStep(u, v, t, gamma, Om)
      t += 0.02
    }
    const Tf = s * T0
    sim.current = { u, v, t, next: Math.ceil(t / Tf) * Tf, trail: [], marks: [], beats: 0 }
    const pts: number[] = []
    let [lu, lv, lt] = [u, v, t]
    for (let i = 0; i < (3 * T0) / 0.02; i++) {
      ;[lu, lv] = cellStep(lu, lv, lt, gamma, Om)
      lt += 0.02
      if (i % 10 === 0) pts.push(lu, lv)
    }
    loop.current = pts
  }, [s, gamma])

  useFrames(visible, (dt) => {
    const c = sim.current
    const Om = TAU / (s * T0)
    const Tf = s * T0
    const steps = Math.round((dt * T0) / 3 / 0.02) // one own period in about 3 seconds
    for (let i = 0; i < steps; i++) {
      ;[c.u, c.v] = cellStep(c.u, c.v, c.t, gamma, Om)
      c.t += 0.02
      if (i % 3 === 0) {
        c.trail.push(c.u, c.v)
        if (c.trail.length > 1200) c.trail.splice(0, 2)
      }
      if (c.t >= c.next) {
        c.next += Tf
        c.beats++
        c.marks.push(phaseOf(c.u, c.v))
        if (c.marks.length > 120) c.marks.shift()
      }
    }
    drawPlane((c.t % Tf) / Tf)
    drawDial()
  })

  const drawPlane = (beatPhase: number) => {
    const el = plane.current
    const ctx = el && fitCanvas(el, 0.75)
    if (!el || !ctx) return
    const W = el.clientWidth || 320
    const H = W * 0.75
    ctx.clearRect(0, 0, W, H)
    const X = (u: number) => ((u + 2.4) / 4.8) * W * 0.78 + W * 0.02
    const Y = (v: number) => H - ((v + 0.8) / 2.8) * H
    const c = sim.current
    ctx.strokeStyle = '#3a4258'
    ctx.beginPath()
    for (let i = 0; i < loop.current.length; i += 2) {
      const x = X(loop.current[i]!)
      const y = Y(loop.current[i + 1]!)
      if (i) ctx.lineTo(x, y)
      else ctx.moveTo(x, y)
    }
    ctx.stroke()
    ctx.strokeStyle = '#6fd3b8'
    ctx.globalAlpha = 0.5
    ctx.beginPath()
    for (let i = 0; i < c.trail.length; i += 2) {
      const x = X(c.trail[i]!)
      const y = Y(c.trail[i + 1]!)
      if (i) ctx.lineTo(x, y)
      else ctx.moveTo(x, y)
    }
    ctx.stroke()
    ctx.globalAlpha = 1
    ctx.fillStyle = '#6d758c'
    ctx.fillText('+', X(U_STAR) - 3, Y(V_STAR) + 3)
    ctx.fillStyle = '#ffffff'
    ctx.beginPath()
    ctx.arc(X(c.u), Y(c.v), 5, 0, TAU)
    ctx.fill()
    // the drum: bright on the beat
    const hit = Math.max(0, 1 - beatPhase * 5)
    const dx = W * 0.9
    const dy = H * 0.2
    ctx.fillStyle = `rgba(255,255,255,${0.12 + 0.8 * hit * Math.min(1, gamma * 12)})`
    ctx.beginPath()
    ctx.arc(dx, dy, 10 + 8 * hit * Math.min(1, gamma * 12), 0, TAU)
    ctx.fill()
    ctx.fillStyle = '#6d758c'
    ctx.font = '11px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('外の拍子', dx, dy + 34)
    ctx.textAlign = 'left'
    ctx.fillText('u（興奮）→', W * 0.02, H - 4)
  }

  const drawDial = () => {
    const el = dial.current
    const ctx = el && fitCanvas(el)
    if (!el || !ctx) return
    const S = el.clientWidth || 160
    const c = S / 2
    const R = S * 0.36
    ctx.clearRect(0, 0, S, S)
    ctx.strokeStyle = '#2a3145'
    ctx.beginPath()
    ctx.arc(c, c, R, 0, TAU)
    ctx.stroke()
    const m = sim.current.marks
    m.forEach((a, k) => {
      ctx.fillStyle = lock.locked ? '#ffffff' : C_PHI
      ctx.globalAlpha = 0.2 + (0.8 * k) / m.length
      ctx.beginPath()
      ctx.arc(c + Math.cos(-a) * R, c + Math.sin(-a) * R, 3, 0, TAU)
      ctx.fill()
    })
    ctx.globalAlpha = 1
  }

  const pick = (id: BeatId) => {
    const b = BEATS.find((x) => x.id === id)!
    useCell.setState({ s: b.w, beat: id })
    setFirst(null)
  }

  const findFirst = () => {
    setFinding(true)
    setTimeout(() => {
      setFirst({ s, g: firstCapture(s) })
      setFinding(false)
    }, 30)
  }

  const beatLabel = beat ? BEATS.find((b) => b.id === beat)!.label : `s = ${s.toFixed(3)}`
  return (
    <Section
      id="cell"
      n={4}
      title="実験 B：自分のリズムを持つ 1 か所に、外から拍子"
      gist={
        <>
          自分で「トクン、トクン」と脈打つものに、外から拍子をかけます。拍子の強さ γ = 0.05 で、
          <b style={{ color: C_PI }}>1/π の拍子は 3 拍に 1 回のリズムに捕まり</b>、
          <b style={{ color: C_PHI }}>黄金比の拍子では自分のリズムのまま</b>でした。
        </>
      }
      look={[
        <>左：白い点が輪をまわるのが 1 回の拍動です。右上の丸が外の拍子で、光るたびに「トン」</>,
        <>
          右の文字盤：拍子が鳴った瞬間の、自分の位置の点。<b>取り込まれると点が決まった数か所に止まり</b>
          、自由なら点が輪をぐるぐる回ります
        </>,
      ]}
      figure={
        <div ref={box}>
          <div className="room-cell">
            <canvas ref={plane} className="room-canvas" role="img" aria-label="1 か所の拍動（位相平面）" />
            <canvas ref={dial} className="room-canvas room-square" role="img" aria-label="拍子ごとの位置" />
          </div>
          <div className="room-verdict" data-guide-state>
            {beatLabel}・γ = {gamma.toFixed(3)} →{' '}
            <b style={{ color: lock.locked && gamma > 0 ? '#fff' : C_PHI }}>{verdict(lock, gamma)}</b>{' '}
            <Tag kind="測定" />
          </div>
        </div>
      }
    >
      <p>
        <b>やったこと：</b>自分で規則正しく振動するもの（周期 T0 = 39.49）を 1
        つ用意しました。心臓のペースメーカー細胞を最も簡単にした式（フィッツヒュー–南雲モデル）です。そこに、外から一定の周期で揺さぶる「拍子」をかけます。拍子の強さを
        γ、拍子の周期と自分の周期の比を s とします（s = 1/3 なら、拍子は自分の 3 倍の速さ）。
      </p>
      <div className="small muted">拍子の比 s</div>
      <Pick
        label="拍子の比 s"
        value={beat}
        onPick={pick}
        options={BEATS.map((b) => ({ value: b.id, label: b.label, color: b.color }))}
      />
      <div className="small muted">拍子の強さ γ</div>
      <Pick
        label="拍子の強さ γ"
        value={GAMMAS.includes(gamma) ? gamma : null}
        onPick={(g) => useCell.setState({ gamma: g })}
        options={GAMMAS.map((g) => ({ value: g, label: String(g) }))}
      />
      <p>
        <b>「取り込まれた」の意味：</b>拍子の q 回ごとに、自分がちょうど p
        回まわるようになり、そのまま固定されることです（p:q にロックする）。
      </p>
      <table className="room-table">
        <caption>
          拍子をかけた結果 <Tag kind="報告" />
        </caption>
        <thead>
          <tr>
            <th>拍子の強さ γ</th>
            <th>s = 1/π</th>
            <th>s = 1/φ（黄金比）</th>
          </tr>
        </thead>
        <tbody>
          {[
            [0.02, '自由', '自由'],
            [0.05, '1/3 に取り込まれた（3 拍に 1 回）', '自由のまま'],
            [0.1, '1/3 に取り込まれた', '3/5 に取り込まれた'],
          ].map(([g, a, b]) => (
            <tr key={g}>
              <td>{g}</td>
              <td>{a}</td>
              <td>{b}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted small">
        上の判定（白い字）は、この画面で報告と同じ手順で計算しています：60 周期ぶん落ち着かせてから、拍子 150
        回ぶんの位置を記録し、q ≤ 12 のどれかで「q 拍ごとにちょうど p 周」のずれが 0.05
        ラジアン未満なら取り込まれた、とします。上の表のどのマスも、ボタンを押すと同じ結果になります。
      </p>
      <More label="最初に取り込まれる強さを調べる（正直な注）">
        <p>
          拍子の比 s をそのまま比べると、最初に取り込まれる γ は次のとおりでした <Tag kind="報告" />。
        </p>
        <table className="room-table">
          <tbody>
            <tr>
              <td>
                <Dot color={C_PI} />
                1/π
              </td>
              <td>0.045</td>
              <td>
                <Dot color={C_PHI} />
                黄金比
              </td>
              <td>0.06</td>
            </tr>
            <tr>
              <td>1/e</td>
              <td>0.065</td>
              <td>1/√2</td>
              <td>0.07</td>
            </tr>
          </tbody>
        </table>
        <p>
          つまり、<b>黄金比が一番強いわけではありません</b>。拍子がかかると自分の速さが少しずれて（0.618 →
          0.612）、隣の分数 3/5
          に寄ってしまうからです。黄金比の特別さは、実際に出るリズム（回転数）のほうに現れます。実験 A
          は、そこを直接測ったものです。
        </p>
        <div className="room-buttons">
          <button onClick={findFirst} disabled={finding}>
            {finding ? '計算中…' : `いまの s（${beatLabel}）で、この画面で調べる`}
          </button>
          {first && first.s === s && (
            <span className="small">
              γ を 0.005 刻みで上げると、最初に取り込まれるのは <b>γ = {first.g ?? '0.3 まででなし'}</b>{' '}
              <Tag kind="測定" />
            </span>
          )}
        </div>
      </More>
    </Section>
  )
}

// ---- 5 the Arnold tongues --------------------------------------------------------------------------

type TongueData = {
  s0: number
  ds: number
  ns: number
  g0: number
  dg: number
  ng: number
  p: number[]
  q: number[]
  first: Record<string, number>
}
const T = tongues as TongueData

/** brighter = simpler fraction; free = the darkest colour */
const tongueColor = (q: number) => (q === 0 ? viridis(0) : viridis(0.2 + 0.8 * q ** -0.8))

export function Tongues() {
  const { s, gamma } = useCell()
  const canvas = useRef<HTMLCanvasElement>(null)
  const box = useRef<HTMLDivElement>(null)
  const visible = useVisible(box, '0px')
  const [rows, setRows] = useState(0)
  const [hover, setHover] = useState<{ s: number; g: number; p: number; q: number } | null>(null)

  // grow the map from the bottom (weak beats) up, the first time it is seen
  useEffect(() => {
    if (!visible || rows >= T.ng) return
    const id = setTimeout(() => setRows((r) => Math.min(T.ng, r + 1)), 45)
    return () => clearTimeout(id)
  }, [visible, rows])

  const X = (sv: number, W: number) => ((sv - T.s0 + T.ds / 2) / (T.ns * T.ds)) * W
  const Y = (g: number, H: number) => H - ((g - T.g0 + T.dg / 2) / (T.ng * T.dg)) * H

  useEffect(() => {
    const el = canvas.current
    const ctx = el && fitCanvas(el, 0.8)
    if (!el || !ctx) return
    const W = el.clientWidth || 320
    const H = W * 0.8
    const cw = W / T.ns
    const ch = H / T.ng
    ctx.fillStyle = '#04050a'
    ctx.fillRect(0, 0, W, H)
    for (let gi = 0; gi < rows; gi++)
      for (let si = 0; si < T.ns; si++) {
        const [r, g, b] = tongueColor(T.q[gi * T.ns + si]!)
        ctx.fillStyle = `rgb(${r},${g},${b})`
        ctx.fillRect(si * cw, H - (gi + 1) * ch, cw + 0.6, ch + 0.6)
      }
    // marks: 1/π and 1/φ
    for (const [x, color] of [
      [1 / Math.PI, C_PI],
      [GOLDEN, C_PHI],
    ] as const) {
      ctx.strokeStyle = color
      ctx.setLineDash([3, 3])
      ctx.beginPath()
      ctx.moveTo(X(x, W), 0)
      ctx.lineTo(X(x, W), H)
      ctx.stroke()
    }
    ctx.setLineDash([])
    // the cell of section 4
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 2
    ctx.strokeRect(X(s, W) - 5, Y(gamma, H) - 5, 10, 10)
    ctx.lineWidth = 1
    ctx.fillStyle = '#ffffff'
    ctx.font = '11px sans-serif'
    for (const [x, t] of [
      [1 / 3, '1/3'],
      [1 / 2, '1/2'],
      [2 / 3, '2/3'],
      [2 / 5, '2/5'],
      [3 / 5, '3/5'],
    ] as const)
      ctx.fillText(t, X(x, W) - 8, H - 4)
  }, [rows, s, gamma])

  const at = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    const si = Math.min(T.ns - 1, Math.max(0, Math.floor(((e.clientX - r.left) / r.width) * T.ns)))
    const gi = Math.min(T.ng - 1, Math.max(0, Math.floor((1 - (e.clientY - r.top) / r.height) * T.ng)))
    const k = gi * T.ns + si
    return { s: +(T.s0 + si * T.ds).toFixed(3), g: +(T.g0 + gi * T.dg).toFixed(3), p: T.p[k]!, q: T.q[k]! }
  }

  return (
    <Section
      id="tongues"
      n={5}
      title="アーノルドの舌 ― どこで取り込まれるかの地図"
      gist={
        <>
          拍子の比 s と強さ γ を細かく変えて、取り込まれる所を地図にしました。
          <b>簡単な分数ほど、舌の形の領域が太く伸びます。</b>
          1/π の線は太い 1/3 の舌のすぐ隣、黄金比の線は細い舌の隙間を通ります。
        </>
      }
      look={[
        <>地図が下（弱い拍子）から上へ育っていきます。明るい舌ほど簡単な分数です</>,
        <>
          <Dot color={C_PI} />
          紫の点線（1/π）が、低い所で 1/3 の舌に入るところ。
          <Dot color={C_PHI} />
          金の点線（黄金比）は、もっと上まで暗い隙間を通ります
        </>,
        <>地図をタップすると、その (s, γ) が 4 章の 1 か所に入り、動きと判定で確かめられます</>,
      ]}
      figure={
        <div ref={box}>
          <canvas
            ref={canvas}
            className="room-canvas"
            role="img"
            aria-label="アーノルドの舌の地図"
            data-testid="tongue-map"
            onPointerMove={(e) => setHover(at(e))}
            onPointerLeave={() => setHover(null)}
            onClick={(e) => {
              const h = at(e)
              useCell.setState({ s: h.s, gamma: h.g, beat: null })
            }}
          />
          <div className="muted small">
            横：拍子の比 s（左 0.30 → 右 0.72）、縦：拍子の強さ γ（下 0 → 上
            0.30）。一番暗い色は自由（取り込まれない）。
            {hover && (
              <b style={{ color: '#d9def0' }}>
                {' '}
                s = {hover.s}、γ = {hover.g}：
                {hover.g === 0 ? '拍子なし' : hover.q ? `${hover.p}/${hover.q}` : '自由'}
              </b>
            )}
          </div>
        </div>
      }
    >
      <p>
        この地図は「<b>アーノルドの舌</b>
        」と呼ばれます。舌のような形の領域が、簡単な分数ほど太く伸びます。中央の大きな舌は 1/2、左の舌は 1/3
        です。
      </p>
      <p>
        どの舌も、下の端（γ →
        0）では細い一点になります。拍子が弱いと、比がぴったり分数のときしか捕まらず、強くなるほど分数の近くまで捕まえる範囲が広がります。
      </p>
      <p className="muted small">
        <Tag kind="報告" /> この地図は、研究の計算ツール（tools/golden_forcing.py）で出したもので、s を 0.003
        刻み（141 列）、γ を 0.005 刻み（61 行）、8601 か所それぞれに 4
        章と同じ判定をしています。ここに載せたのはその結果のデータです。4
        章の判定はこの画面で同じ式から計算しているので、地図をタップして比べられます（舌の縁ぎりぎりでは、計算の細かい誤差で食い違うことがあります）。
        この地図から読んだ「最初に取り込まれる γ」は 1/π {T.first['1/pi']}・黄金比 {T.first['1/phi']}・1/e{' '}
        {T.first['1/e']}・1/√2 {T.first['1/sqrt2']} で、報告の値と同じです。
      </p>
    </Section>
  )
}
