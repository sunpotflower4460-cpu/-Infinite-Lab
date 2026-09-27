import { useEffect, useRef, useState } from 'react'
import { nearFractions } from '../../golden/golden'
import { GOLDEN, TAU } from '../../rhythm/models'
import { Dot, More, Section, Tag } from '../Golden/Sections'
import { C_FRAC, C_PHI, C_PI, fitCanvas, Pick, useFrames, useVisible } from './common'

// ---- 1 two rotations ---------------------------------------------------------------------------

const CLOCK_RATIOS = [
  { id: '1/2', w: 1 / 2, label: '1/2', color: C_FRAC },
  { id: '1/3', w: 1 / 3, label: '1/3', color: C_FRAC },
  { id: '2/3', w: 2 / 3, label: '2/3', color: C_FRAC },
  { id: 'pi', w: 1 / Math.PI, label: '1/π', color: C_PI },
  { id: 'phi', w: GOLDEN, label: '1/φ（黄金比）', color: C_PHI },
] as const
type ClockId = (typeof CLOCK_RATIOS)[number]['id']
const BINS = 72 // 5° each

/**
 * Two hands. The outer (the beat) turns once per "knock"; the inner (your own rhythm) turns w times
 * as far. At every knock the inner hand's position is marked, and a bar grows there: a fraction puts
 * the knocks on the same few places again and again; the golden ratio spreads them evenly.
 */
export function TwoRotations() {
  const [id, setId] = useState<ClockId>('1/2')
  const [fast, setFast] = useState(false)
  const r = CLOCK_RATIOS.find((c) => c.id === id)!
  const box = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const visible = useVisible(box)
  const st = useRef({ beats: 0, phase: 0, bins: new Float64Array(BINS), marks: [] as number[] })
  const [stats, setStats] = useState({ beats: 0, places: 0, top: 0 })

  const reset = () => {
    st.current = { beats: 0, phase: 0, bins: new Float64Array(BINS), marks: [] }
    setStats({ beats: 0, places: 0, top: 0 })
  }
  useEffect(reset, [id])

  useFrames(visible, (dt) => {
    const s = st.current
    const speed = fast ? 12 : 0.8 // beats per second
    s.phase += dt * speed
    while (s.phase >= 1) {
      s.phase -= 1
      s.beats++
      const pos = (s.beats * r.w) % 1 // where the inner hand is at this knock
      s.bins[Math.floor(pos * BINS) % BINS]!++
      s.marks.push(pos)
      if (s.marks.length > 400) s.marks.shift()
    }
    draw()
    if (s.beats !== stats.beats) {
      let places = 0
      let top = 0
      for (const b of s.bins) {
        if (b > 0) places++
        top = Math.max(top, b)
      }
      setStats({ beats: s.beats, places, top: s.beats ? top / s.beats : 0 })
    }
  })

  const draw = () => {
    const el = canvas.current
    if (!el) return
    const ctx = fitCanvas(el)
    if (!ctx) return
    const S = el.clientWidth || 320
    const c = S / 2
    const R = S * 0.3
    ctx.clearRect(0, 0, S, S)
    const s = st.current
    const ang = (turn: number) => -Math.PI / 2 + TAU * turn
    // bars: how often each place was knocked
    const max = Math.max(4, ...s.bins)
    for (let i = 0; i < BINS; i++) {
      const b = s.bins[i]!
      if (!b) continue
      const a = ang((i + 0.5) / BINS)
      const len = (b / max) * S * 0.17
      ctx.strokeStyle = r.color
      ctx.globalAlpha = 0.85
      ctx.lineWidth = Math.max(2, ((TAU * R) / BINS) * 0.7)
      ctx.beginPath()
      ctx.moveTo(c + Math.cos(a) * (R + 6), c + Math.sin(a) * (R + 6))
      ctx.lineTo(c + Math.cos(a) * (R + 6 + len), c + Math.sin(a) * (R + 6 + len))
      ctx.stroke()
    }
    ctx.globalAlpha = 1
    // dial
    ctx.strokeStyle = '#2a3145'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.arc(c, c, R, 0, TAU)
    ctx.stroke()
    // recent knocks as dots on the dial
    s.marks.forEach((m, k) => {
      const a = ang(m)
      ctx.fillStyle = r.color
      ctx.globalAlpha = 0.25 + (0.75 * k) / s.marks.length
      ctx.beginPath()
      ctx.arc(c + Math.cos(a) * R, c + Math.sin(a) * R, 2.5, 0, TAU)
      ctx.fill()
    })
    ctx.globalAlpha = 1
    // hands: outer = the beat (once per knock), inner = own rhythm (w per knock)
    const beatA = ang(s.phase)
    const ownA = ang(((s.beats + s.phase) * r.w) % 1)
    const knock = s.phase < 0.12 && !fast
    ctx.strokeStyle = knock ? '#ffffff' : '#6d758c'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(c, c)
    ctx.lineTo(c + Math.cos(beatA) * R * 0.95, c + Math.sin(beatA) * R * 0.95)
    ctx.stroke()
    ctx.strokeStyle = r.color
    ctx.lineWidth = 4
    ctx.beginPath()
    ctx.moveTo(c, c)
    ctx.lineTo(c + Math.cos(ownA) * R * 0.72, c + Math.sin(ownA) * R * 0.72)
    ctx.stroke()
    ctx.fillStyle = '#d9def0'
    ctx.beginPath()
    ctx.arc(c, c, 4, 0, TAU)
    ctx.fill()
    if (knock) {
      ctx.fillStyle = '#ffffff'
      ctx.font = `${Math.round(S * 0.05)}px sans-serif`
      ctx.textAlign = 'center'
      ctx.fillText('コツン', c, c - R - S * 0.2 + S * 0.05)
    }
  }

  return (
    <Section
      id="two"
      n={1}
      title="2 つの回転 ― 同じ所に戻るか、戻らないか"
      gist={
        <>
          2 つの速さの比が<b>簡単な分数</b>だと、すぐ同じ位置関係に戻り、同じ所を押され続けます（共鳴）。
          <b style={{ color: C_PHI }}>分数にならない比</b>だと、二度と同じ所に戻らず、押す力がばらけます。
        </>
      }
      look={[
        <>灰色の長い針が 1 周するたびに「コツン」。そのとき色の針がいた所に点を打ち、外側の棒を伸ばします</>,
        <>1/2 では棒が 2 本だけ伸び続け、黄金比では棒が円じゅうに薄く散らばるところ</>,
        <>
          <Dot color={C_PI} />
          1/π は、3 本の腕のように回りながら、約 22 か所に集まるところ（1/π が 1/3 と 7/22 に近いから）
        </>,
      ]}
      figure={
        <div ref={box}>
          <canvas
            ref={canvas}
            className="room-canvas room-square"
            role="img"
            aria-label="2 本の針と、コツンの場所"
          />
          <div className="room-meter" data-guide-state>
            コツン <b>{stats.beats}</b> 回・押された場所 <b>{stats.places}</b> / {BINS}{' '}
            か所・いちばん多い場所に <b>{Math.round(stats.top * 100)}%</b>
            <Tag kind="測定" />
          </div>
        </div>
      }
    >
      <Pick
        label="速さの比"
        value={id}
        onPick={setId}
        options={CLOCK_RATIOS.map((c) => ({ value: c.id, label: c.label, color: c.color }))}
      />
      <div className="room-buttons">
        <button onClick={() => setFast(!fast)} aria-pressed={fast}>
          {fast ? 'ふつうの速さ' : '早送り'}
        </button>
        <button onClick={reset}>最初から</button>
      </div>
      <p>
        2
        つのものが別々の速さで回っているとします。たとえば、自分の拍動と外の拍子、コマの回転と蹴られる周期です。大事なのは
        <b>2 つの速さの比</b>です。
      </p>
      <p>
        比が 1/2 なら、灰色の針が 2 周するあいだに色の針はちょうど 1
        周して、もとの位置関係に戻ります。戻るたびに
        <b>同じ所を押される</b>ので、影響が積み重なります。これを<b>共鳴</b>
        といい、片方がもう片方に捕まりやすくなります。
      </p>
      <p>
        比が分数にならないと、同じ位置関係に二度と戻りません（<b>めぐり合わない</b>
        ）。押される場所がばらけて、影響は打ち消し合います。
      </p>
      <p className="muted small">
        <Tag kind="読み方" />{' '}
        「コツン」と棒は、押される場所を目で見るための描き方です。棒の本数・高さは、この画面で数えた値です。
      </p>
    </Section>
  )
}

// ---- 2 near and far from fractions -------------------------------------------------------------

interface View {
  lo: number
  hi: number
}
const WHOLE: View = { lo: 0, hi: 1 }
const around = (x: number, w: number): View => ({ lo: x - w / 2, hi: x + w / 2 })
const ZOOMS = [
  { id: 'all', label: '全体', view: WHOLE },
  { id: 'pi1', label: '1/π を 25 倍', view: around(1 / Math.PI, 0.04) },
  { id: 'pi2', label: '1/π を 2500 倍', view: around(1 / Math.PI, 0.0004) },
  { id: 'phi1', label: '1/φ を 25 倍', view: around(GOLDEN, 0.04) },
  { id: 'phi2', label: '1/φ を 2500 倍', view: around(GOLDEN, 0.0004) },
] as const
const TARGETS = [
  { x: 1 / Math.PI, t: '1/π', c: C_PI },
  { x: GOLDEN, t: '1/φ', c: C_PHI },
]

type Frac = { p: number; q: number; x: number }
const key = (f: { p: number; q: number }) => `${f.p}/${f.q}`

/** Fractions p/q (lowest terms) inside the view, q ≤ qmax. */
function fractionsIn(v: View, qmax: number): Frac[] {
  const out: Frac[] = []
  for (let q = 1; q <= qmax; q++)
    for (let p = Math.ceil(v.lo * q); p <= Math.floor(v.hi * q); p++)
      if (gcd(p, q) === 1) out.push({ p, q, x: p / q })
  return out
}
function gcd(a: number, b: number): number {
  while (b) [a, b] = [b, a % b]
  return Math.abs(a)
}
/** The closest fraction with denominator ≤ qmax (searched directly). */
function closest(x: number, qmax: number) {
  let best = { p: 0, q: 1 }
  for (let q = 1; q <= qmax; q++) {
    const p = Math.round(x * q)
    if (Math.abs(p / q - x) < Math.abs(best.p / best.q - x)) best = { p, q }
  }
  return { ...best, off: Math.abs(best.p / best.q - x) }
}

export function NearAndFar() {
  const [zoom, setZoom] = useState<(typeof ZOOMS)[number]['id']>('all')
  const [view, setView] = useState<View>(WHOLE)
  const target = ZOOMS.find((z) => z.id === zoom)!.view
  // animate the zoom (log-scale on the width); time-based, so it ends on time even at a low frame rate
  useEffect(() => {
    let raf = 0
    const from = view
    const start = performance.now()
    const tick = (now: number) => {
      const k = Math.min(1, (now - start) / 900)
      const e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2
      const w0 = from.hi - from.lo
      const w1 = target.hi - target.lo
      const w = Math.exp(Math.log(w0) + (Math.log(w1) - Math.log(w0)) * e)
      const c = (from.lo + from.hi) / 2 + ((target.lo + target.hi) / 2 - (from.lo + from.hi) / 2) * e
      setView({ lo: c - w / 2, hi: c + w / 2 })
      if (k < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom])

  const width = view.hi - view.lo
  const W = 640
  const X = (x: number) => 20 + ((x - view.lo) / width) * (W - 40)
  const piF = nearFractions(1 / Math.PI, 6)
  const phiF = nearFractions(GOLDEN, 12)
  // the targets' best fractions up to denominator 400 (as in the readout below the line)
  const bestF = [...piF, ...phiF].filter((f) => f.q <= 400)
  const best = new Set(bestF.map(key))
  // tick marks: more (and finer) fractions the closer we look; the targets' best fractions always
  const qmax = Math.min(400, Math.max(8, Math.round(Math.sqrt(30 / width))))
  const fr = fractionsIn(view, qmax)
  for (const f of bestF) {
    const x = f.p / f.q
    if (f.q > qmax && x >= view.lo && x <= view.hi) fr.push({ ...f, x })
  }
  // labels: the targets' best fractions (closest first), then small denominators; never two within 44 px
  const placed: number[] = []
  const labelled = new Set<string>()
  const gap = (f: Frac) => Math.min(...TARGETS.map((m) => Math.abs(f.x - m.x)))
  const order = (f: Frac) => (best.has(key(f)) ? gap(f) : 1 + f.q) // the closest best fraction first
  for (const f of [...fr].sort((a, b) => order(a) - order(b))) {
    const x = X(f.x)
    if (placed.some((p) => Math.abs(p - x) < 44)) continue
    placed.push(x)
    labelled.add(key(f))
  }
  const shown = TARGETS.filter((m) => m.x >= view.lo && m.x <= view.hi)
  const digits = width < 0.001 ? 7 : 4
  const piRows = piF.slice(0, 5)
  const phiRows = phiF.slice(3, 9)
  return (
    <Section
      id="near"
      n={2}
      title="分数に近い数・遠い数"
      gist={
        <>
          <b style={{ color: C_PI }}>1/π</b> は分数 1/3・7/22 のすぐ隣にあります（π は分数にとても近い数）。
          <b style={{ color: C_PHI }}>1/φ</b>
          は、どれだけ拡大しても、いつも 2 つの分数の<b>隙間</b>にいます（どの分数からも最も遠い数）。
        </>
      }
      look={[
        <>「1/π を 2500 倍」：紫の点のすぐ左に 7/22、ほぼ真上に 113/355 が乗るところ</>,
        <>「1/φ を 2500 倍」：金の点の両側に分数があって、どちらにも寄らないところ</>,
        <>線が太いほど分母が小さい分数（引き込む力が強い）</>,
      ]}
      figure={
        <div>
          <svg viewBox={`0 0 ${W} 150`} className="room-line" role="img" aria-label="数直線と分数">
            <line x1={10} x2={W - 10} y1={80} y2={80} stroke="#3a4258" />
            {fr
              .sort((a, b) => b.q - a.q)
              .map((f) => {
                const x = X(f.x)
                const big = Math.max(0.6, 5 / Math.sqrt(f.q))
                return (
                  <g key={key(f)}>
                    <line
                      x1={x}
                      x2={x}
                      y1={80 - 6 - big * 2}
                      y2={80 + 6 + big * 2}
                      stroke="#d9def0"
                      strokeWidth={big}
                      opacity={0.35 + 0.65 / Math.sqrt(f.q)}
                    />
                    {labelled.has(key(f)) && (
                      <text x={x} y={114} textAnchor="middle" fontSize="11" fill={C_FRAC}>
                        {key(f)}
                      </text>
                    )}
                  </g>
                )
              })}
            {shown.map((m) => (
              <g key={m.t}>
                <circle cx={X(m.x)} cy={80} r={6} fill={m.c} />
                <text x={X(m.x)} y={52} textAnchor="middle" fontSize="12" fill={m.c}>
                  {m.t} = {m.x.toFixed(digits)}
                </text>
              </g>
            ))}
            <text x={12} y={144} fontSize="10" fill="#6d758c">
              {view.lo.toFixed(digits)}
            </text>
            <text x={W - 12} y={144} fontSize="10" fill="#6d758c" textAnchor="end">
              {view.hi.toFixed(digits)}
            </text>
          </svg>
          <Pick
            label="どこを見るか"
            value={zoom}
            onPick={setZoom}
            options={ZOOMS.map((z) => ({ value: z.id, label: z.label }))}
          />
          <div className="room-meter">
            {TARGETS.map((m) => {
              const c = closest(m.x, 400)
              return (
                <div key={m.t}>
                  <Dot color={m.c} />
                  分母 400 までで {m.t} にいちばん近い分数：<b>{key(c)}</b>（ずれ {c.off.toExponential(1)}）
                </div>
              )
            })}
            <Tag kind="測定" />
          </div>
        </div>
      }
    >
      <p>
        数には「分数への近さ」があります。π（3.14159…）は、実は分数にとても近い数です。22/7 = 3.1429、355/113
        は小数第 6 位まで一致します。だから 1/π = 0.3183 は、1/3 = 0.3333 にも、7/22 = 0.3182 にも近いのです。
      </p>
      <p>
        黄金比 φ（1.618…）は、<b>どの分数からも最も遠い数</b>です。連分数で書くと 1 + 1/(1 + 1/(1 + …)) と 1
        が永遠に続き、分数での近づき方が一番遅くなります。1/φ = 0.6180 は、3/5（0.600）と
        5/8（0.625）のあいだにあります。
      </p>
      <div className="room-cf" aria-label="連分数">
        <div>
          <span style={{ color: C_PI }}>1/π</span> = 0 + 1/(<b>3</b> + 1/(<b>7</b> + 1/(<b>15</b> + 1/(
          <b>1</b> + 1/(
          <b>292</b> + …)))))
        </div>
        <div>
          <span style={{ color: C_PHI }}>1/φ</span> = 0 + 1/(<b>1</b> + 1/(<b>1</b> + 1/(<b>1</b> + 1/(
          <b>1</b> + 1/(
          <b>1</b> + …)))))
        </div>
      </div>
      <p className="small">
        連分数の途中で止めると、その数に一番よく近い分数が出ます。大きな数（π の 292
        など）の直前で止めた分数は、飛び抜けて近くなります。1
        だけが続く黄金比には、そういう「飛び抜けて近い分数」が一つもありません。
      </p>
      <More label="近づき方を数字で見る">
        <div className="room-tables">
          <table className="room-table">
            <thead>
              <tr>
                <th>1/π に近い分数</th>
                <th>ずれ</th>
              </tr>
            </thead>
            <tbody>
              {piRows.map((f) => (
                <tr key={key(f)}>
                  <td>{key(f)}</td>
                  <td>{Math.abs(f.p / f.q - 1 / Math.PI).toExponential(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <table className="room-table">
            <thead>
              <tr>
                <th>1/φ に近い分数</th>
                <th>ずれ</th>
              </tr>
            </thead>
            <tbody>
              {phiRows.map((f) => (
                <tr key={key(f)}>
                  <td>{key(f)}</td>
                  <td>{Math.abs(f.p / f.q - GOLDEN).toExponential(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muted small">
          <Tag kind="測定" /> この画面で計算。1/φ に近い分数はフィボナッチ数の比（3/5, 5/8, 8/13,
          …）です。分母が同じくらいで比べると、1/π のほうがずっと近くなります（113/355 は分母 355 で、ずれは 1
          億分の 3）。
        </p>
      </More>
    </Section>
  )
}
