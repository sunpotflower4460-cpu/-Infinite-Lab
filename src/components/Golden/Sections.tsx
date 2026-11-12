import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { getController } from '../../app/LabController'
import {
  circleTest,
  continuedFraction,
  coverageByTurn,
  GOLDEN_ANGLE_DEG,
  GOLDEN_CRITICAL_K,
  nearFractions,
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

/**
 * One topic: the one-line gist first (enough to follow the whole room), then what to look at
 * in the picture, then the explanation. Detailed numbers go into a collapsed "くわしく".
 */
function Section({
  id,
  n,
  title,
  gist,
  look,
  figure,
  children,
}: {
  id: string
  n: number
  title: string
  gist: ReactNode
  look: ReactNode[]
  figure: ReactNode
  children: ReactNode
}) {
  return (
    <section className="room-sec" id={`room-${id}`} data-testid={`room-${id}`}>
      <h3>
        <span className="room-n">{n}</span> {title}
      </h3>
      <p className="room-gist">
        <span className="room-gist-label">ひとことで</span>
        {gist}
      </p>
      <div className="room-grid">
        <div className="room-fig">{figure}</div>
        <div className="room-text">
          <div className="room-look">
            <div className="room-look-label">ここを見て</div>
            <ul>
              {look.map((l, i) => (
                <li key={i}>{l}</li>
              ))}
            </ul>
          </div>
          {children}
        </div>
      </div>
    </section>
  )
}

const Tag = ({ kind }: { kind: '測定' | '文献' }) => (
  <span
    className={`room-tag room-tag-${kind}`}
    title={kind === '測定' ? 'このページでその場で計算した値' : '数学の文献にある値'}
  >
    {kind}
  </span>
)

function More({ children, label = 'くわしい数字を見る' }: { children: ReactNode; label?: string }) {
  return (
    <details className="room-more">
      <summary>{label}</summary>
      {children}
    </details>
  )
}

const Dot = ({ color }: { color: string }) => <span className="room-dot" style={{ background: color }} />

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
      gist={<>円を 5 等分して星を描くと、長い線と短い線の長さの比が、ちょうど黄金比 1.618… になります。</>}
      look={[
        <>
          <b style={{ color: '#fff' }}>白い線（対角線）</b>は、<b style={{ color: C_PHI }}>黄色い線（辺）</b>
          の 1.618… 倍の長さ
        </>,
        <>右の表の 3 つの数が、同じ数になっているところ</>,
      ]}
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
              図で測った 対角線 ÷ 辺 <Tag kind="測定" />
            </th>
            <td>{r.ratio.toFixed(15)}</td>
          </tr>
          <tr>
            <th>
              2 × cos 36° <Tag kind="測定" />
            </th>
            <td>{r.twoCos.toFixed(15)}</td>
          </tr>
          <tr>
            <th>黄金比 φ = (1 + √5) / 2</th>
            <td>{phi40.slice(0, 18)}…</td>
          </tr>
        </tbody>
      </table>
      <p>
        36° は、円を 10 等分した角度です（π/5 ラジアン）。式で書くと <b>φ = 2·cos(π/5)</b>。ここに π
        が入っていることが、黄金比と円（π）の 1 つめの出会いです。
      </p>
      <p className="muted">
        星形の真ん中には小さな正五角形ができ、その中にまた星が描けます。どの大きさでも、長い線 ÷ 短い線 = φ
        です。
      </p>
      <More>
        <p className="room-long mono">φ（40 桁、BigInt で計算）= {phi40}</p>
        <p className="muted">
          図から測った値と 2·cos 36° は、コンピュータの小数（約 16 桁）の精度で φ と一致しています。
        </p>
      </More>
    </Section>
  )
}

// ---- 2 ---------------------------------------------------------------------------------------

const SUN_PRESETS = [
  { label: '黄金角 137.508°', deg: GOLDEN_ANGLE_DEG },
  { label: '137.3°', deg: 137.3 },
  { label: '137.0°', deg: 137 },
  { label: '1/7 周（51.43°）', deg: 360 / 7 },
  { label: 'π の小数部だけ（50.97°）', deg: 360 * (Math.PI - 3) },
]

export function Sunflower() {
  const [deg, setDeg] = useState(GOLDEN_ANGLE_DEG)
  const pts = useMemo(() => seeds(800, deg), [deg])
  const golden = Math.abs(deg - GOLDEN_ANGLE_DEG) < 1e-9
  const near = useMemo(() => nearFractions(deg / 360, 7), [deg])
  return (
    <Section
      id="sunflower"
      n={2}
      title="黄金角：ひまわりの種の並び方"
      gist={
        <>
          種を 1 つ置くたびに <b>137.5°</b>{' '}
          ずつ回すと、いつまでも同じ向きに重ならず、いちばん隙間なく詰まります。この角度が「黄金角」です。
        </>
      }
      look={[
        <>スライダーを黄金角から少しだけ動かすと、放射状のすじ（隙間）が現れるところ</>,
        <>下の「近い分数」の分母が、すじの本数の目安になっていること</>,
      ]}
      figure={
        <svg viewBox="-1.05 -1.05 2.1 2.1" className="room-svg" role="img" aria-label="ひまわりの種の並び">
          {pts.map(([x, y], i) => (
            <circle key={i} cx={x} cy={-y} r={0.018} fill={golden ? C_PHI : '#9aa6c8'} />
          ))}
        </svg>
      }
    >
      <label className="room-slider">
        <span>
          1 個ごとに回す角度：<b>{deg.toFixed(3)}°</b>（一周の {(deg / 360).toFixed(5)}）
        </span>
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
      <p data-testid="sun-near">
        <b>近い分数：</b>
        {near.map((f) => `${f.p}/${f.q}`).join('、')}
        {near.length >= 7 ? '、…' : ''} <Tag kind="測定" />
      </p>
      <p>
        回す角度が「一周の q 分の p」に近いと、q 回ごとにほぼ同じ向きに戻ってしまい、種は q
        本のすじに並びます。
        <b>1/7 周</b>なら 7 本。<b>π の小数部だけ回す</b>（0.14159… 周）と、π が 22/7 に近いので、やはりほぼ 7
        本になります。
      </p>
      <p>
        黄金角の近い分数は 1/2、1/3、2/5、3/8、5/13、8/21… で、分母は{' '}
        <b>2, 3, 5, 8, 13, 21…（フィボナッチ数）</b>
        です。どの分数にもなかなか近づかないので、すじが目立ちません。本物のひまわりの種のらせんの数も、多くは
        21, 34, 55 などのフィボナッチ数です。
      </p>
      <More label="「黄金比で割った角度」について">
        <p className="muted">
          一周 360° を黄金比 1.618… で割ると 222.49° です。黄金角 137.51° は、その残り（360° −
          222.49°）にあたります。回る向きが逆なだけで、種の並び方は同じです。式で書くと 360° ÷ φ² =
          137.5078…°。
        </p>
      </More>
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
  const c113 = pi.convergents.find((c) => c.q === 113n)!
  const table = (cf: typeof pi, color: string, label: string) => (
    <table className="room-table room-cf">
      <caption style={{ color }}>{label}</caption>
      <thead>
        <tr>
          <th>連分数の数</th>
          <th>分数</th>
          <th>ずれ</th>
          <th>分母² × ずれ</th>
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
      gist={
        <>
          2 つとも分数では書けない数ですが、<b style={{ color: C_PI }}>π は分数にそっくりになるのが得意</b>
          （355/113 は小数第 6 位まで同じ）、<b style={{ color: C_PHI }}>φ はいちばん苦手</b>です。
        </>
      }
      look={[
        <>
          <Dot color={C_PI} /> π の線が、355/113 のところで深く沈んでいるところ
        </>,
        <>
          <Dot color={C_PHI} /> φ の線が、ずっと同じ高さ（0.447）のままのところ
        </>,
      ]}
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
          <text x={W - 96} y={Y(1 / Math.sqrt(5)) + 16} fontSize="10" fill={C_PHI}>
            φ：ずっと 0.447
          </text>
          <text x={34} y={H - 8} fontSize="9" fill="var(--muted)">
            → 何番目に近い分数か（下にあるほど「分数にそっくり」）
          </text>
        </svg>
      }
    >
      <p>
        分母を大きくすれば、どんな数にも、いくらでも近い分数が作れます。そこで、<b>分母の大きさのわりに</b>
        どれだけ近いか（分母² ×
        ずれ）を縦に取りました。下にあるほど「分母のわりに近すぎる＝分数にそっくり」です。
      </p>
      <p>
        <span style={{ color: C_PI }}>π</span> は 22/7（分母 7）でぐっと近づき、355/113（分母 113）では分母² ×
        ずれが <b>{c113.scaled.toFixed(4)}</b> まで下がります <Tag kind="測定" />。
        <span style={{ color: C_PHI }}> φ</span> は
        1/1、2/1、3/2、5/3、8/5…（フィボナッチ数の比）と近づきますが、何番目でも約 0.447
        のまま。これ以上「分数に似ていない数」はないことが知られています（最も無理数らしい数）。
      </p>
      <More>
        <p>
          連分数：<b style={{ color: C_PI }}>π = [{pi.terms.slice(0, 8).join(', ')}, …]</b>、
          <b style={{ color: C_PHI }}> φ = [{phi.terms.slice(0, 8).join(', ')}, …]</b> <Tag kind="測定" />
        </p>
        <p className="muted">
          連分数は「整数の部分を取り出して、残りの小数をひっくり返す」をくり返して並べた数です。大きな数（π の
          15 や 292）が出る直前で、分数がぐっと近づきます。φ は 1
          がずっと続くので、いつまでたっても近づき方が遅いままです。値は π と φ を BigInt で 80
          桁計算して求めています。
        </p>
        <div className="room-tables">
          {table(pi, C_PI, 'π')}
          {table(phi, C_PHI, 'φ')}
        </div>
      </More>
    </Section>
  )
}

// ---- 4 ---------------------------------------------------------------------------------------

const RATIOS = [
  { id: 'pi', label: 'π', a: Math.PI, color: C_PI },
  { id: 'phi2', label: 'φ²（= φ + 1）', a: PHI * PHI, color: C_PHI },
  { id: 'frac', label: '22/7', a: 22 / 7, color: C_FRAC },
] as const
const MAX_TURNS = 150

export function TorusFill() {
  const [turns, setTurns] = useState(20)
  const [playing, setPlaying] = useState(false)
  const curves = useMemo(() => RATIOS.map((r) => coverageByTurn(r.a, MAX_TURNS)), [])
  const full = curves.map((c) => c.findIndex((v) => v >= 1))
  useEffect(() => {
    if (!playing) return
    const id = setInterval(() => setTurns((t) => Math.min(MAX_TURNS, t + 1)), 60)
    return () => clearInterval(id)
  }, [playing])
  useEffect(() => {
    if (playing && turns >= MAX_TURNS) setPlaying(false)
  }, [playing, turns])

  const W = 320
  const H = 150
  const X = (t: number) => 28 + (t / MAX_TURNS) * (W - 36)
  const Y = (c: number) => H - 18 - c * (H - 28)
  return (
    <Section
      id="torus"
      n={4}
      title="トーラスを埋める速さ"
      gist={
        <>
          2 つの回転を組み合わせてドーナツの表面に線を描くと、比が分数に近い π は同じ所の近くを回り続け、
          <b style={{ color: C_PHI }}>φ はどんどん新しい所へ行って、先に表面を埋めます</b>。
        </>
      }
      look={[
        <>▶ 動かす を押して、3 つの正方形で線が増えていく様子の違い</>,
        <>
          グラフで、
          <Dot color={C_PHI} />
          φ² が {full[1]} 周、
          <Dot color={C_PI} />π が {full[0]} 周で 100% になるところ。
          <Dot color={C_FRAC} />
          22/7 は何周しても増えない
        </>,
      ]}
      figure={
        <div>
          <div className="room-tori">
            {RATIOS.map((r, i) => (
              <figure key={r.id}>
                <FlatTorus a={r.a} turns={turns} color={r.color} />
                <figcaption>
                  <b style={{ color: r.color }}>{r.label}</b>
                  <br />
                  埋まった割合 {(curves[i]![turns]! * 100).toFixed(1)}%
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
      <TorusDiagram />
      <label className="room-slider">
        <span>
          根元の腕の周回数：<b>{turns}</b> 周
        </span>
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
        <Tag kind="測定" /> 100 × 100 のマスのうち、線が通ったマスの割合です。50 周では φ² が{' '}
        {(curves[1]![50]! * 100).toFixed(0)}%、π が {(curves[0]![50]! * 100).toFixed(0)}%。
      </p>
      <p>
        π の比だと、1 周するごとに 1/7 周に近い量だけずれるので、<b>7 周でほぼ元の場所に戻ってしまいます</b>
        。そのあとは少しずつしかずれず、355/113 の分母と同じ <b>113 周</b>でやっと埋まり切ります。22/7
        はちょうど 7 周で閉じるので、それ以上は何周しても増えません（{' '}
        {(curves[2]![MAX_TURNS]! * 100).toFixed(0)}% のまま）。
      </p>
      <More label="補足">
        <p className="muted">
          φ² = φ + 1 = 2.618… は、φ = 1.618… と小数部分（0.618…）が同じなので、トーラスの上では φ
          とまったく同じ線になります。マスの数え方は、線が通るマスを 1
          つずつ正確にたどる方法です（点を打つ間隔による見落としはありません）。
        </p>
      </More>
      <button className="room-link" onClick={openLabTorus}>
        ラボの 3D トーラスで見る（比 φ。vs 22/7 で比べられます）→
      </button>
    </Section>
  )
}

/** Why a square: the torus cut open, with the glued edges marked. */
function TorusDiagram() {
  return (
    <div className="room-diagram">
      <svg viewBox="0 0 300 92" role="img" aria-label="トーラスを切り開くと正方形">
        <ellipse cx="52" cy="46" rx="44" ry="26" fill="none" stroke="var(--muted)" strokeWidth="1.5" />
        <ellipse cx="52" cy="44" rx="16" ry="6" fill="none" stroke="var(--muted)" strokeWidth="1.5" />
        <line x1="70" y1="54" x2="78" y2="70" stroke="#ff8a65" strokeWidth="1.5" strokeDasharray="3 2" />
        <text x="104" y="50" fontSize="16" fill="var(--muted)">
          →
        </text>
        <rect x="130" y="10" width="72" height="72" fill="none" stroke="var(--muted)" strokeWidth="1.5" />
        <path d="M150 10 l6 -4 v8 z M150 82 l6 -4 v8 z" fill="#7f9cff" />
        <path d="M130 40 l-4 6 h8 z M202 40 l-4 6 h8 z" fill="#ff8a65" />
        <text x="212" y="30" fontSize="10" fill="var(--text)">
          上と下、左と右は
        </text>
        <text x="212" y="44" fontSize="10" fill="var(--text)">
          つながっている
        </text>
        <text x="212" y="66" fontSize="10" fill="var(--muted)">
          横 = 根元の腕
        </text>
        <text x="212" y="80" fontSize="10" fill="var(--muted)">
          縦 = 先の腕
        </text>
      </svg>
      <p className="muted small">
        ドーナツの表面を 2
        か所で切って開くと正方形になります。線が上にはみ出したら下から、右にはみ出したら左から続きます。
      </p>
    </div>
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
    ctx.beginPath()
    for (let t = 0; t < turns; t++) {
      // the same straight pieces the coverage counts: up to the top edge, then on from the bottom
      const y0 = (frac * t) % 1
      const xWrap = frac > 0 ? (1 - y0) / frac : Infinity
      const seg = (x0: number, y0s: number, x1: number, y1: number) => {
        ctx.moveTo(x0 * size, (1 - y0s) * size)
        ctx.lineTo(x1 * size, (1 - y1) * size)
      }
      if (xWrap >= 1) seg(0, y0, 1, y0 + frac)
      else {
        seg(0, y0, xWrap, 1)
        seg(xWrap, 0, 1, frac * (1 - xWrap))
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

type Wall = { K: number; status: 'running' | 'crossed' | 'blocked'; n?: number }

export function Kam() {
  const [K, setK] = useState(0.6)
  const [result, setResult] = useState<KamResult | null>(null)
  const [wall, setWall] = useState<Wall | null>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const wallRun = useRef(0) // a new run, a change of K or closing the room cancels the running test

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
    wallRun.current++
    setWall(null) // the result belongs to the previous K
  }, [K])
  useEffect(() => () => void wallRun.current++, [])

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
    const run = ++wallRun.current
    const MAX = 1_000_000
    const CHUNK = 50_000 // computed in chunks so the page stays responsive
    setWall({ K: k, status: 'running' })
    let done = 0
    let state = WALL_START
    const tick = () => {
      if (run !== wallRun.current) return // cancelled
      const r = wallSteps(k, state, CHUNK)
      if (r.crossed !== null) return setWall({ K: k, status: 'crossed', n: done + r.crossed })
      done += CHUNK
      state = r
      if (done >= MAX) return setWall({ K: k, status: 'blocked', n: MAX })
      setTimeout(tick, 0)
    }
    setTimeout(tick, 0)
  }

  const golden = result?.tests.find((t) => t.id === 'golden')
  return (
    <Section
      id="kam"
      n={5}
      title="揺さぶっても最後まで残るのは黄金比（KAM 理論）"
      gist={
        <>
          2 つの回転でできた輪（トーラス）を外から揺さぶると、分数に近いリズムのものから壊れていき、
          <b style={{ color: C_PHI }}>黄金比のリズムの輪が最後まで残ります</b>。
        </>
      }
      look={[
        <>
          K のボタンを 0.3 → 0.6 → 0.9 → 1.0 と押して、色のついた横長の輪が 1
          本ずつ、ばらばらの点に崩れていくところ
        </>,
        <>
          <Dot color={C_PI} />π − 3 がいちばん先に、
          <Dot color={C_PHI} />
          黄金比がいちばん最後に崩れること
        </>,
      ]}
      figure={
        <div>
          <canvas ref={canvas} className="room-canvas room-kam" aria-label="Standard map phase portrait" />
          <div className="room-legend">
            {(result?.tests ?? []).map((t) => (
              <span key={t.id}>
                <Dot color={KAM_COLORS[t.id]!} />
                {t.label}
              </span>
            ))}
          </div>
          <div className="muted small">
            横：回った角度、縦：回る速さ。横長の線 1 本が 1 つの輪（トーラス）です。
          </div>
        </div>
      }
    >
      <p>
        <b>たとえ話：</b>ブランコを決まった間隔で押すとします。揺れのリズムと押すリズムが簡単な分数の関係（1/2
        や 1/7
        など）だと、押す力がいつも同じタイミングで積み重なり、揺れが大きく乱れます（共鳴）。分数から遠いリズムほど押す力がばらけて、乱れにくくなります。黄金比は分数から最も遠いので、いちばん強く揺さぶるまで乱れません。
      </p>
      <label className="room-slider">
        <span>
          揺さぶりの強さ K：<b>{K.toFixed(3)}</b>
        </span>
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
            <th>輪のリズム（1 回で回る周）</th>
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
        <Tag kind="文献" /> 黄金比の輪が壊れるのは K ≈ {GOLDEN_CRITICAL_K}（Greene, 1979）。
        {golden && result && (
          <>
            {' '}
            いまの K = {result.K.toFixed(3)} では、この計算でも黄金比の輪は
            <b>{golden.survives ? '残っています' : '壊れています'}</b>。
          </>
        )}
      </p>
      <More label="どうやって「残っている」を判定しているか">
        <p className="muted">
          図は「標準写像」という、回転を一定の間隔で蹴るいちばん簡単なモデルです（p′ = p + K·sin θ、θ′ = θ +
          p′）。その輪のリズムになる出発点を探し、20,000 回計算して、点がなめらかな 1
          本の線に並ぶかどうかで判定しています。壊れる直前の K
          では、有限回の計算なので判定がどちらにも揺れることがあります。
        </p>
      </More>
      <div className="room-wall">
        <p>
          <b>壁のテスト：</b>
          残っている輪は、点が下から上へ通り抜けるのをふさぐ「壁」になります。点が一周分上まで抜けられるか試します。
        </p>
        <button onClick={runWall} disabled={wall?.status === 'running'}>
          K = {K.toFixed(3)} で試す（最大 100 万回）
        </button>
        {wall && (
          <p data-testid="kam-wall">
            {wall.status === 'running'
              ? '計算中…'
              : wall.status === 'crossed'
                ? `${wall.n!.toLocaleString('en-US')} 回目で上まで抜けました。横に一周する輪は、もう 1 本も残っていません。`
                : wall.K > GOLDEN_CRITICAL_K
                  ? `${wall.n!.toLocaleString('en-US')} 回計算しても抜けませんでした。この K では輪はもう残っていませんが（文献）、壊れたばかりの輪が「穴だらけの壁」として通り道をほとんどふさいでいるためです。もっと長く計算すると抜けます（K = 1.0 では約 2,700 万回）。`
                  : `${wall.n!.toLocaleString('en-US')} 回計算しても抜けませんでした。残っている輪が壁になっています。`}
          </p>
        )}
      </div>
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
      title="注意：たまたま近いだけの式"
      gist={
        <>「π ≈ 4/√φ」という式がよく紹介されますが、0.1% ずれた偶然の一致で、本当の関係ではありません。</>
      }
      look={[<>「ずれ」の行：355/113 と比べると、1 万倍以上も粗い一致であること</>]}
      figure={
        <table className="room-table room-big">
          <tbody>
            <tr>
              <th style={{ color: C_PI }}>π</th>
              <td>{piText(15)}</td>
            </tr>
            <tr>
              <th>4 ÷ √φ</th>
              <td>{fourOverRootPhi.toFixed(15)}</td>
            </tr>
            <tr>
              <th>
                ずれ <Tag kind="測定" />
              </th>
              <td>{(rel * 100).toFixed(3)}%</td>
            </tr>
            <tr>
              <th>くらべて：355/113 のずれ</th>
              <td>{(rel355 * 100).toFixed(7)}%</td>
            </tr>
          </tbody>
        </table>
      }
    >
      <p>
        4/√φ が π と同じなのは「3.14」までで、その先は違います。2
        つの数のあいだに、この式でつながる理由はありません。
      </p>
    </Section>
  )
}

// ---- summary --------------------------------------------------------------------------------

export function Summary() {
  return (
    <section className="room-sec room-summary" id="room-summary" data-testid="room-summary">
      <h3>まとめ：黄金比と π の本当のつながり</h3>
      <ol>
        <li>
          <b>円の上で出会う。</b>円を 5 等分すると黄金比が現れ（φ =
          2·cos(π/5)）、一周を黄金比で分けると黄金角になる。
        </li>
        <li>
          <b>分数への近さが正反対。</b>π は分数にそっくりになるのが得意（22/7、355/113）、φ はいちばん苦手。
        </li>
        <li>
          <b>だから、回すと正反対にふるまう。</b>π のリズムは同じ所に戻りがちで、揺さぶりに弱い。φ
          のリズムはいつも新しい所へ行き、面を早く埋め、揺さぶっても最後まで壊れない。
        </li>
      </ol>
      <details className="room-more">
        <summary>ことば</summary>
        <dl className="room-glossary">
          <dt>トーラス</dt>
          <dd>
            ドーナツの表面の形。2 つの回転（根元の腕と先の腕）の組み合わせは、ドーナツの表面の 1
            点で表せます。
          </dd>
          <dt>連分数</dt>
          <dd>
            「整数の部分を取り出して、残りをひっくり返す」をくり返して得る数の列。その数に近い分数を順に教えてくれます。
          </dd>
          <dt>共鳴</dt>
          <dd>リズムが分数の関係にあるとき、同じタイミングで力が積み重なって、揺れが大きくなること。</dd>
          <dt>KAM 理論</dt>
          <dd>
            揺さぶりが小さければ、分数から遠いリズムの輪（トーラス）は壊れずに残る、という定理（コルモゴロフ・アーノルド・モーザー）。
          </dd>
        </dl>
      </details>
    </section>
  )
}
