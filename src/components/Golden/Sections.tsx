import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { getController } from '../../app/LabController'
import {
  circleTest,
  continuedFraction,
  coverageByTurn,
  GOLDEN_ANGLE_DEG,
  GOLDEN_CRITICAL_K,
  orbit,
  pentagon,
  pentagonRatio,
  PHI,
  phiText,
  piText,
  ROTATIONS,
  seeds,
  TAU,
  WALL_START,
  wallSteps,
  type CircleTest,
} from '../../golden/golden'
import { closeRoom } from '../../golden/room'
import { parseConfig } from '../../lab/config'
import { computePhi } from '../../math/constants/phi'
import { computePi } from '../../math/constants/pi'

const C_PI = '#ff8a65'
const C_PHI = '#ffc766'
const C_FRAC = '#8a93ad'

function Section({
  id,
  n,
  title,
  lead,
  figure,
  children,
}: {
  id: string
  n: number
  title: string
  lead: string
  figure: ReactNode
  children: ReactNode
}) {
  return (
    <section className="room-sec" id={`room-${id}`} data-testid={`room-${id}`}>
      <h3>
        <span className="room-n">{n}</span> {title}
      </h3>
      <p className="room-lead">{lead}</p>
      <div className="room-grid">
        <div className="room-fig">{figure}</div>
        <div className="room-text">{children}</div>
      </div>
    </section>
  )
}

const Tag = ({ kind }: { kind: '測定' | '理論' | '文献' }) => (
  <span className={`room-tag room-tag-${kind}`}>{kind}</span>
)

// ---- 1 ---------------------------------------------------------------------------------------

export function Pentagon() {
  const v = pentagon().map(([x, y]) => [x, -y] as const) // SVG y points down
  const r = pentagonRatio()
  const star = [0, 2, 4, 1, 3, 0].map((i) => v[i]!.join(',')).join(' ')
  const phi40 = phiText(40)
  return (
    <Section
      id="pentagon"
      n={1}
      title="正五角形の中で出会う"
      lead="正五角形の対角線と辺の比が黄金比です。φ = 2·cos(π/5)。円を 5 つに分けると、そこに黄金比が現れます。"
      figure={
        <svg viewBox="-1.25 -1.25 2.5 2.5" className="room-svg" role="img" aria-label="正五角形と星形">
          <circle r="1" fill="none" stroke="var(--line)" strokeWidth="0.01" />
          <polygon
            points={v.map((p) => p.join(',')).join(' ')}
            fill="none"
            stroke="var(--muted)"
            strokeWidth="0.012"
          />
          <polyline points={star} fill="none" stroke="#7f9cff" strokeOpacity="0.5" strokeWidth="0.01" />
          <line x1={v[0]![0]} y1={v[0]![1]} x2={v[1]![0]} y2={v[1]![1]} stroke={C_PHI} strokeWidth="0.03" />
          <line x1={v[0]![0]} y1={v[0]![1]} x2={v[2]![0]} y2={v[2]![1]} stroke="#fff" strokeWidth="0.03" />
          <text
            x={(v[0]![0] + v[1]![0]) / 2 - 0.3}
            y={(v[0]![1] + v[1]![1]) / 2}
            fontSize="0.13"
            fill={C_PHI}
          >
            辺
          </text>
          <text
            x={(v[0]![0] + v[2]![0]) / 2 + 0.06}
            y={(v[0]![1] + v[2]![1]) / 2}
            fontSize="0.13"
            fill="#fff"
          >
            対角線
          </text>
        </svg>
      }
    >
      <table className="room-table">
        <tbody>
          <tr>
            <th>
              対角線 ÷ 辺 <Tag kind="測定" />
            </th>
            <td>{r.ratio.toFixed(15)}</td>
          </tr>
          <tr>
            <th>
              2 × cos(π/5) = 2 × cos 36° <Tag kind="測定" />
            </th>
            <td>{r.twoCos.toFixed(15)}</td>
          </tr>
          <tr>
            <th>φ = (1 + √5) / 2（40 桁）</th>
            <td className="room-long">{phi40}</td>
          </tr>
        </tbody>
      </table>
      <p>
        図の頂点から測った比と、2·cos(π/5) が、float64 の精度（約 16 桁）で φ
        と一致します。星形の中にはさらに小さな正五角形ができ、どこを見ても辺と対角線の比が φ になっています。
      </p>
    </Section>
  )
}

// ---- 2 ---------------------------------------------------------------------------------------

const SUN_PRESETS = [
  { label: '黄金角 137.508°', deg: GOLDEN_ANGLE_DEG },
  { label: '137.0°', deg: 137 },
  { label: '137.3°', deg: 137.3 },
  { label: '1/7 回転（51.43°）', deg: 360 / 7 },
  { label: 'π − 3 回転（50.97°）', deg: 360 * (Math.PI - 3) },
]

export function Sunflower() {
  const [deg, setDeg] = useState(GOLDEN_ANGLE_DEG)
  const pts = useMemo(() => seeds(800, deg), [deg])
  return (
    <Section
      id="sunflower"
      n={2}
      title="黄金角：ひまわりの種の並び方"
      lead="種を 1 つ置くたびに同じ角度だけ回して、少し外側に置いていきます（Vogel のモデル）。角度が黄金角のときだけ、いつまでも同じ向きに重ならず、隙間なく詰まります。"
      figure={
        <svg viewBox="-1.05 -1.05 2.1 2.1" className="room-svg" role="img" aria-label="ひまわりの種の並び">
          {pts.map(([x, y], i) => (
            <circle
              key={i}
              cx={x}
              cy={-y}
              r={0.018}
              fill={Math.abs(deg - GOLDEN_ANGLE_DEG) < 1e-9 ? C_PHI : '#9aa6c8'}
            />
          ))}
        </svg>
      }
    >
      <label className="room-slider">
        1 個ごとに回す角度：<b>{deg.toFixed(4)}°</b>（一周の {(deg / 360).toFixed(6)}）
        <input
          type="range"
          min={45}
          max={180}
          step={0.001}
          value={deg}
          onChange={(e) => setDeg(Number(e.target.value))}
          aria-label="Angle per seed"
        />
      </label>
      <div className="room-buttons">
        {SUN_PRESETS.map((p) => (
          <button
            key={p.label}
            onClick={() => setDeg(p.deg)}
            className={Math.abs(deg - p.deg) < 1e-9 ? 'active' : ''}
          >
            {p.label}
          </button>
        ))}
      </div>
      <p>
        角度が一周の分数 p/q に近いと、種は q 本の腕（放射状のすじ）に並び、腕のあいだに隙間が残ります。「1/7
        回転」ではちょうど 7 本、「π − 3 回転」（π の小数部 0.14159… だけ回す）でもほぼ 7 本になります。π が
        22/7 に近いからです。
      </p>
      <p className="muted">
        正確には、一周 360° を黄金比で割ると 222.49° で、黄金角 137.51° はその残り（360° − 360°/φ =
        360°/φ²）です。回る向きが逆なだけで、並び方は同じです。
      </p>
    </Section>
  )
}

// ---- 3 ---------------------------------------------------------------------------------------

export function Fractions() {
  const { pi, phi } = useMemo(() => {
    const p = computePi(80)
    const f = computePhi(80)
    return {
      pi: continuedFraction(p.digits, p.integerPartLength, 12),
      phi: continuedFraction(f.digits, f.integerPartLength, 16),
    }
  }, [])
  // chart: convergent number (x) against q² × |x − p/q| (y, log scale 0.001 … 1)
  const W = 320
  const H = 220
  const N = 12
  const X = (i: number) => 34 + (i / (N - 1)) * (W - 50)
  const Y = (v: number) => 14 + (-Math.log10(Math.max(v, 1e-3)) / 3) * (H - 44)
  const series = (cf: typeof pi) => cf.convergents.slice(0, N).map((c, i) => ({ c, x: X(i), y: Y(c.scaled) }))
  const table = (cf: typeof pi, color: string, label: string) => (
    <table className="room-table room-cf">
      <caption style={{ color }}>{label}</caption>
      <thead>
        <tr>
          <th>a</th>
          <th>分数 p/q</th>
          <th>ずれ |x − p/q|</th>
          <th>q² × ずれ</th>
        </tr>
      </thead>
      <tbody>
        {cf.convergents.slice(0, 9).map((c, i) => (
          <tr key={i} className={c.q === 113n ? 'room-hit' : ''}>
            <td>{cf.terms[i]}</td>
            <td>
              {c.p.toString()}/{c.q.toString()}
            </td>
            <td>{c.error === 0 ? '0' : c.error.toExponential(2)}</td>
            <td>{c.scaled.toFixed(3)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
  return (
    <Section
      id="fractions"
      n={3}
      title="いちばん大事なこと：分数に近いかどうか"
      lead="2 つとも分数では書けない数です。でも性質は正反対で、π は分数にとても近く、φ はどの分数からも最も遠い数です。"
      figure={
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="room-svg room-chart"
          role="img"
          aria-label="分数への近さのグラフ"
        >
          {[1, 0.1, 0.01, 0.001].map((v) => (
            <g key={v}>
              <line x1={34} x2={W - 12} y1={Y(v)} y2={Y(v)} stroke="var(--line)" />
              <text x={2} y={Y(v) + 3} fontSize="9" fill="var(--muted)">
                {v}
              </text>
            </g>
          ))}
          {(
            [
              [phi, C_PHI],
              [pi, C_PI],
            ] as const
          ).map(([cf, color]) => (
            <g key={color}>
              <polyline
                fill="none"
                stroke={color}
                strokeOpacity="0.5"
                points={series(cf)
                  .map((q) => `${q.x},${q.y}`)
                  .join(' ')}
              />
              {series(cf).map((q, i) => (
                <circle key={i} cx={q.x} cy={q.y} r={3.2} fill={color} />
              ))}
            </g>
          ))}
          {series(pi)
            .filter((q) => q.c.q === 113n || q.c.q === 7n)
            .map((q) => (
              <text key={String(q.c.q)} x={q.x + 6} y={q.y + 4} fontSize="10" fill={C_PI}>
                {q.c.p.toString()}/{q.c.q.toString()}
              </text>
            ))}
          <text x={W - 118} y={Y(1 / Math.sqrt(5)) - 6} fontSize="10" fill={C_PHI}>
            φ：いつも 0.447
          </text>
          <text x={34} y={H - 8} fontSize="9" fill="var(--muted)">
            何番目の分数か → 縦：q² × ずれ（下ほど分母のわりに近い）
          </text>
        </svg>
      }
    >
      <p>
        連分数：<b style={{ color: C_PI }}>π = [{pi.terms.slice(0, 8).join(', ')}, …]</b>、
        <b style={{ color: C_PHI }}> φ = [{phi.terms.slice(0, 8).join(', ')}, …]</b>
        <Tag kind="測定" />
      </p>
      <p>
        大きな項（π の 15 や 292）の直前で、分数がぐっと近づきます。355/113 は小数第 6 位まで π
        と一致します（「q² × ずれ」が 0.003 しかありません）。φ の項は 1
        がずっと続くので、分数（フィボナッチ数の比）で近づくのが一番遅く、「q² × ずれ」はいつまでも 1/√5 ≈
        0.447 のままです。これが「最も無理数らしい数」の意味です。
      </p>
      <div className="room-tables">
        {table(pi, C_PI, 'π')}
        {table(phi, C_PHI, 'φ')}
      </div>
    </Section>
  )
}

// ---- 4 ---------------------------------------------------------------------------------------

const RATIOS = [
  { id: 'pi', label: 'π', a: Math.PI, color: C_PI },
  { id: 'phi2', label: 'φ + 1 = φ²', a: PHI * PHI, color: C_PHI },
  { id: 'frac', label: '22/7', a: 22 / 7, color: C_FRAC },
] as const
const MAX_TURNS = 150

export function TorusFill() {
  const [turns, setTurns] = useState(20)
  const [playing, setPlaying] = useState(false)
  const curves = useMemo(() => RATIOS.map((r) => coverageByTurn(r.a, MAX_TURNS)), [])
  useEffect(() => {
    if (!playing) return
    const id = setInterval(() => setTurns((t) => (t >= MAX_TURNS ? (setPlaying(false), t) : t + 1)), 60)
    return () => clearInterval(id)
  }, [playing])

  const W = 320
  const H = 150
  const X = (t: number) => 28 + (t / MAX_TURNS) * (W - 36)
  const Y = (c: number) => H - 18 - c * (H - 28)
  return (
    <Section
      id="torus"
      n={4}
      title="トーラスを埋める速さ"
      lead="2 つの回転の速さの比 a で、トーラスの上に線を描きます。トーラスを切り開いた正方形の上では、線は x = t、y = a·t（はみ出たら反対側から戻る）です。比が分数に近いほど、線は同じ所の近くに戻ってきて、なかなか面を埋めません。"
      figure={
        <div>
          <div className="room-tori">
            {RATIOS.map((r, i) => (
              <figure key={r.id}>
                <FlatTorus a={r.a} turns={turns} color={r.color} />
                <figcaption>
                  <b style={{ color: r.color }}>{r.label}</b> 埋まった割合{' '}
                  {(curves[i]![turns]! * 100).toFixed(1)}%
                </figcaption>
              </figure>
            ))}
          </div>
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="room-svg room-chart"
            role="img"
            aria-label="埋まった割合のグラフ"
          >
            {[0, 0.5, 1].map((c) => (
              <g key={c}>
                <line x1={28} x2={W - 8} y1={Y(c)} y2={Y(c)} stroke="var(--line)" />
                <text x={2} y={Y(c) + 3} fontSize="9" fill="var(--muted)">
                  {c * 100}%
                </text>
              </g>
            ))}
            <line
              x1={X(113)}
              x2={X(113)}
              y1={Y(0)}
              y2={Y(1)}
              stroke={C_PI}
              strokeDasharray="3 3"
              strokeOpacity="0.6"
            />
            <text x={X(113) + 3} y={Y(0.08)} fontSize="9" fill={C_PI}>
              113 周
            </text>
            {curves.map((c, i) => (
              <polyline
                key={i}
                fill="none"
                stroke={RATIOS[i]!.color}
                strokeWidth="1.6"
                points={c.map((v, t) => `${X(t)},${Y(v)}`).join(' ')}
              />
            ))}
            <line x1={X(turns)} x2={X(turns)} y1={Y(0)} y2={Y(1)} stroke="#fff" strokeOpacity="0.5" />
            <text x={W - 60} y={H - 4} fontSize="9" fill="var(--muted)">
              周回数 →
            </text>
          </svg>
        </div>
      }
    >
      <label className="room-slider">
        根元の腕の周回数：<b>{turns}</b>
        <input
          type="range"
          min={0}
          max={MAX_TURNS}
          value={turns}
          onChange={(e) => setTurns(Number(e.target.value))}
          aria-label="Turns"
        />
      </label>
      <div className="room-buttons">
        <button onClick={() => (turns >= MAX_TURNS && setTurns(0), setPlaying(!playing))}>
          {playing ? '⏸ 止める' : '▶ 動かす'}
        </button>
        {[7, 50, 113].map((t) => (
          <button key={t} onClick={() => setTurns(t)}>
            {t} 周
          </button>
        ))}
      </div>
      <p>
        <Tag kind="測定" /> 100 × 100 のマスのうち、線が通ったマスの割合です。50 周で φ² は{' '}
        {(curves[1]![50]! * 100).toFixed(0)}%、π は {(curves[0]![50]! * 100).toFixed(0)}% を埋めました。π は 1
        周ごとに 1/7 周に近いずれ方をするので、7 周でほぼ元に戻り、その後ゆっくりずれていきます。そして
        355/113 の分母の 113 周で、ちょうど埋まり切ります。22/7 は 7
        周で完全に閉じるので、それ以上は何周しても埋まりません。
      </p>
      <p className="muted">
        φ² = φ + 1 は φ と小数部が同じ（0.618…）なので、トーラスの上では φ と同じ埋め方をします。
      </p>
      <button className="room-link" onClick={openLabTorus}>
        ラボの 3D トーラスで見る（比 φ、vs 22/7 で比較）→
      </button>
    </Section>
  )
}

function openLabTorus() {
  const c = getController()
  c.applyConfig(
    parseConfig({ constant: 'phi', precision: 100_000, experiment: 'two-arm-torus', parameters: {} }),
  )
  closeRoom()
}

/** The flat torus (unit square) with the line (t, a·t mod 1) drawn for t ∈ [0, turns]. */
function FlatTorus({ a, turns, color }: { a: number; turns: number; color: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const size = canvas.clientWidth || 150
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = size * dpr
    canvas.height = size * dpr
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.fillStyle = '#04050a'
    ctx.fillRect(0, 0, size, size)
    ctx.strokeStyle = color
    ctx.globalAlpha = 0.55
    ctx.lineWidth = 1
    const frac = a - Math.floor(a)
    const S = 120
    ctx.beginPath()
    for (let t = 0; t < turns; t++) {
      const y0 = (frac * t) % 1
      let prev = -1
      for (let i = 0; i <= S; i++) {
        const x = i / S
        const y = (y0 + frac * x) % 1
        const px = x * size
        const py = (1 - y) * size
        if (i === 0 || y < prev) ctx.moveTo(px, py)
        else ctx.lineTo(px, py)
        prev = y
      }
    }
    ctx.stroke()
  }, [a, turns, color])
  return <canvas ref={ref} className="room-canvas room-flat" aria-label="Flat torus" />
}

// ---- 5 ---------------------------------------------------------------------------------------

const KAM_COLORS: Record<string, string> = { pi: C_PI, e: '#b78cff', sqrt2: '#6fd3b8', golden: C_PHI }

interface KamResult {
  K: number
  tests: (CircleTest & { id: string; label: string; w: number })[]
}

export function Kam() {
  const [K, setK] = useState(0.6)
  const [result, setResult] = useState<KamResult | null>(null)
  const [wall, setWall] = useState<{
    K: number
    status: 'running' | 'crossed' | 'blocked'
    n?: number
  } | null>(null)
  const canvas = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const id = setTimeout(() => {
      setResult({
        K,
        tests: ROTATIONS.map((r) => ({ ...circleTest(K, r.w), id: r.id, label: r.label, w: r.w })),
      })
    }, 120)
    return () => clearTimeout(id)
  }, [K])

  useEffect(() => {
    const el = canvas.current
    const ctx = el?.getContext('2d')
    if (!el || !ctx || !result) return
    const size = el.clientWidth || 320
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    el.width = size * dpr
    el.height = size * dpr
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.fillStyle = '#04050a'
    ctx.fillRect(0, 0, size, size)
    const plot = (pts: Float32Array, color: string, r: number, alpha: number) => {
      ctx.fillStyle = color
      ctx.globalAlpha = alpha
      for (let i = 0; i < pts.length; i += 2)
        ctx.fillRect((pts[i]! / TAU) * size, (1 - pts[i + 1]! / TAU) * size, r, r)
    }
    for (let j = 0; j < 28; j++)
      plot(orbit(result.K, j % 2 ? Math.PI : 0, (TAU * (j + 0.5)) / 28, 700), '#8a93ad', 1, 0.5)
    for (const t of result.tests)
      plot(orbit(result.K, 0, t.p0, 3000), KAM_COLORS[t.id]!, 1.6, t.survives ? 0.95 : 0.6)
    ctx.globalAlpha = 1
  }, [result])

  const runWall = () => {
    const k = K
    const MAX = 1_000_000
    const CHUNK = 50_000 // computed in chunks so the page stays responsive
    setWall({ K: k, status: 'running' })
    let done = 0
    let state = WALL_START
    const tick = () => {
      const r = wallSteps(k, state, CHUNK)
      if (r.crossed !== null) return setWall({ K: k, status: 'crossed', n: done + r.crossed })
      done += CHUNK
      state = r
      if (done >= MAX) return setWall({ K: k, status: 'blocked', n: MAX })
      setTimeout(tick, 0)
    }
    setTimeout(tick, 0)
  }

  return (
    <Section
      id="kam"
      n={5}
      title="KAM：揺さぶっても最後まで残るトーラス"
      lead="2 つの回転からできるトーラス状の動きに、外から揺さぶりを加えていきます（標準写像：p′ = p + K·sin θ、θ′ = θ + p′）。K = 0 では横一直線の線（トーラス）が全部残っていて、K を上げると、回転の比が分数に近いものから壊れていきます。"
      figure={
        <div>
          <canvas ref={canvas} className="room-canvas room-kam" aria-label="Standard map phase portrait" />
          <div className="muted small">横：角度 θ（0〜2π）、縦：p（0〜2π）</div>
        </div>
      }
    >
      <label className="room-slider">
        揺さぶりの強さ K：<b>{K.toFixed(3)}</b>
        <input
          type="range"
          min={0}
          max={1.3}
          step={0.005}
          value={K}
          onChange={(e) => setK(Number(e.target.value))}
          aria-label="Kick strength K"
        />
      </label>
      <div className="room-buttons">
        {[0.3, 0.6, 0.9, 0.97, 1.0, 1.2].map((k) => (
          <button key={k} onClick={() => setK(k)} className={K === k ? 'active' : ''}>
            K = {k}
          </button>
        ))}
      </div>
      <table className="room-table" data-testid="kam-table">
        <thead>
          <tr>
            <th>回転の比（1 回の蹴りで回る周）</th>
            <th>
              K = {result?.K.toFixed(3) ?? '…'} で <Tag kind="測定" />
            </th>
          </tr>
        </thead>
        <tbody>
          {(result?.tests ?? []).map((t) => (
            <tr key={t.id}>
              <th style={{ color: KAM_COLORS[t.id] }}>
                {t.label}（{t.w.toFixed(4)}）
              </th>
              <td>{t.survives ? '残っている' : '壊れた'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>
        K を上げていくと、π − 3（ほぼ 1/7）のトーラスがまず壊れ、e − 2、√2 − 1
        の順に続き、黄金比のトーラスが最後まで残ります。黄金比は分数から最も遠く、共鳴（同じ所に戻って揺れが積み重なること）を起こしにくいからです。
        <Tag kind="文献" /> 黄金比のトーラスが壊れるのは K ≈ {GOLDEN_CRITICAL_K}（Greene, 1979）。
      </p>
      <p className="muted">
        判定の方法：その回転の比になる出発点を探し、20,000 回の計算で点が滑らかな 1
        本の曲線に並ぶかを見ています。壊れる直前の K では、有限回の計算なので判定が揺れることがあります。
      </p>
      <div className="room-buttons">
        <button onClick={runWall} disabled={wall?.status === 'running'}>
          トーラスが「壁」になっているか試す（最大 100 万回）
        </button>
      </div>
      {wall && (
        <p data-testid="kam-wall">
          K = {wall.K.toFixed(3)}：
          {wall.status === 'running'
            ? '計算中…'
            : wall.status === 'crossed'
              ? `下の端から出発した点が ${wall.n!.toLocaleString('en-US')} 回目で一周分上まで抜けました。横に一周するトーラスはもう残っていません。`
              : `${wall.n!.toLocaleString('en-US')} 回計算しても抜けませんでした。残っているトーラスが壁になっています（それ以上計算すれば抜ける可能性は残ります）。`}
        </p>
      )}
    </Section>
  )
}

// ---- 6 ---------------------------------------------------------------------------------------

export function Coincidence() {
  const fourOverRootPhi = 4 / Math.sqrt(PHI)
  const rel = (fourOverRootPhi - Math.PI) / Math.PI
  const rel355 = (355 / 113 - Math.PI) / Math.PI
  return (
    <Section
      id="coincidence"
      n={6}
      title="注意：偶然の一致"
      lead="「π ≈ 4/√φ」という式がよく紹介されますが、これは偶然の一致で、本当の関係ではありません。"
      figure={
        <table className="room-table room-big">
          <tbody>
            <tr>
              <th style={{ color: C_PI }}>π</th>
              <td>{piText(20)}</td>
            </tr>
            <tr>
              <th>4/√φ</th>
              <td>{fourOverRootPhi.toFixed(15)}</td>
            </tr>
            <tr>
              <th>ずれ</th>
              <td>
                {(rel * 100).toFixed(3)}% <Tag kind="測定" />
              </td>
            </tr>
            <tr>
              <th>参考：355/113 のずれ</th>
              <td>{(rel355 * 100).toFixed(7)}%</td>
            </tr>
          </tbody>
        </table>
      }
    >
      <p>
        4/√φ は小数第 2 位までしか合わず、0.1% ずれます。355/113 のずれ（0.0000085%）と比べると、1
        万倍以上も粗い一致です。
      </p>
      <p>
        2 つの本当のつながりは、この部屋で見てきた 2 つです。<b>円の上で出会うこと</b>（正五角形と黄金角）と、
        <b>分数に近いか遠いか</b>で正反対の性質を持つこと（トーラスの埋まり方と、揺さぶりへの強さ）です。
      </p>
    </Section>
  )
}
