import { useEffect, useRef, useState } from 'react'
import { GOLDEN, K_GRID, RATIOS, smOrbit } from '../../rhythm/models'
import { Dot, More, Section, Tag } from '../Golden/Sections'
import { C_PHI, C_PI, fitCanvas, useRhythmWorker, useVisible } from './common'

const COLORS: Record<string, string> = {
  golden: C_PHI,
  sqrt2m1: '#6fd3b8',
  inve: '#7f9cff',
  invsqrt2: '#e8a0c8',
  invpi: C_PI,
}
/** The report's table (A1): the last K on its grid with a circle within 1e-3 of the ratio. */
const REPORT_LAST: Record<string, string> = {
  golden: '0.972（一番最後）',
  sqrt2m1: '0.957',
  inve: '0.90',
  invsqrt2: '0.90',
  invpi: '0.80（一番早く壊れた）',
}

type Circle = { p0: number; w: number }

/**
 * Experiment A: the kicked top (standard map). The phase portrait at K, the circles found by the
 * report's scan (4001 starts, Birkhoff averages) coloured by the ratio they turn at, and the "barcode"
 * of which rotations survive as K grows.
 */
export function KickedTop() {
  const [K, setK] = useState(0.5)
  const [scan, setScan] = useState<{ K: number; circles: Circle[] } | null>(null)
  const [playing, setPlaying] = useState(false)
  const canvas = useRef<HTMLCanvasElement>(null)
  const box = useRef<HTMLDivElement>(null)
  const visible = useVisible(box)
  const worker = useRhythmWorker((r) => {
    if (r.kind === 'circles') setScan({ K: r.K, circles: r.circles })
  })

  // the scan for this K (a second or two, in the worker)
  useEffect(() => {
    if (!visible) return
    const id = setTimeout(() => worker.send({ kind: 'circles', K }), 150)
    return () => clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [K, visible])

  // ▶: walk the report's K grid, waiting for each scan
  useEffect(() => {
    if (!playing || scan?.K !== K) return
    const i = K_GRID.indexOf(K)
    if (i < 0 || i === K_GRID.length - 1) {
      if (i === K_GRID.length - 1) setPlaying(false)
      else setK(K_GRID[0]!)
      return
    }
    const id = setTimeout(() => setK(K_GRID[i + 1]!), i < 9 ? 1200 : 1600)
    return () => clearTimeout(id)
  }, [playing, scan, K])

  const current = scan?.K === K ? scan : null
  const found = RATIOS.map((r) => {
    const near = current?.circles.filter((c) => Math.abs(c.w - r.w) < 1e-3) ?? []
    const best = near.sort((a, b) => Math.abs(a.w - r.w) - Math.abs(b.w - r.w))[0] ?? null
    return { ...r, circle: best }
  })

  useEffect(() => {
    const el = canvas.current
    const ctx = el && fitCanvas(el)
    if (!el || !ctx) return
    const S = el.clientWidth || 320
    ctx.fillStyle = '#04050a'
    ctx.fillRect(0, 0, S, S)
    const plot = (pts: Float32Array, color: string, r: number, alpha: number) => {
      ctx.fillStyle = color
      ctx.globalAlpha = alpha
      for (let i = 0; i < pts.length; i += 2) ctx.fillRect(pts[i]! * S, (1 - pts[i + 1]!) * S, r, r)
    }
    for (let j = 0; j < 36; j++) plot(smOrbit(K, j % 2 ? 0.5 : 0, (j + 0.5) / 36, 600), '#8a93ad', 1, 0.45)
    for (const f of found) if (f.circle) plot(smOrbit(K, 0, f.circle.p0, 2500), COLORS[f.id]!, 1.8, 0.95)
    ctx.globalAlpha = 1
    // where each ratio would be at K = 0 (a straight line at height ω)
    for (const f of found) {
      ctx.fillStyle = COLORS[f.id]!
      ctx.fillRect(S - 6, (1 - f.w) * S - 1, 6, 2)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [K, current])

  return (
    <Section
      id="top"
      n={3}
      title="実験 A：蹴られるコマ ― どの回転が最後まで残るか"
      gist={
        <>
          回るコマを一定の間隔で蹴ります。蹴りを強くすると、規則正しい回り方が 1 つずつ壊れていき、
          <b style={{ color: C_PHI }}>最後まで残るのは黄金比の回り方</b>でした。
          <b style={{ color: C_PI }}>1/π の回り方</b>は、比べた中で一番早く壊れました。
        </>
      }
      look={[
        <>
          ▶ を押すと、蹴りの強さ K が 0.5 から 0.98
          まで上がっていきます。横に長くのびた色の線が「規則正しい回り方」です
        </>,
        <>
          色の線が 1 本ずつ消え、灰色のばらばらの点（カオス）に飲まれていくところ。最後に残る
          <Dot color={C_PHI} />
          金の線が黄金比です
        </>,
      ]}
      figure={
        <div ref={box}>
          <canvas ref={canvas} className="room-canvas room-square" role="img" aria-label="標準写像の図" />
          <div className="room-legend">
            {found.map((f) => (
              <span key={f.id} style={{ opacity: f.circle ? 1 : 0.4 }}>
                <Dot color={COLORS[f.id]!} />
                {f.short} {current ? (f.circle ? '残っている' : '壊れた') : '…'}
              </span>
            ))}
          </div>
          <div className="muted small">
            横：コマの向き（0〜1 周）、縦：1
            回の蹴りのあいだに回る量。上下・左右の端はつながっていて、この四角はドーナツ（トーラス）の表面を切り開いたものです。
          </div>
        </div>
      }
    >
      <label className="room-slider">
        <span data-guide-state>
          蹴りの強さ K：<b>{K.toFixed(3)}</b>
          {current ? '' : '（計算中…）'}
        </span>
        <input
          type="range"
          min={0.5}
          max={1}
          step={0.001}
          value={K}
          onChange={(e) => {
            setPlaying(false)
            setK(+e.target.value)
          }}
          aria-label="蹴りの強さ K"
        />
      </label>
      <div className="room-buttons">
        <button onClick={() => (playing ? setPlaying(false) : (setK(0.5), setPlaying(true)))}>
          {playing ? '■ 止める' : '▶ K を上げていく'}
        </button>
        {[0.8, 0.85, 0.957, 0.972, 0.975].map((k) => (
          <button
            key={k}
            onClick={() => {
              setPlaying(false)
              setK(k)
            }}
          >
            K = {k}
          </button>
        ))}
      </div>
      <p>
        <b>やったこと：</b>
        回るコマ（回転子）を、一定の間隔で横から蹴る計算です。物理でよく使われる「標準写像」
        です。蹴りが弱いうちは、どの速さのコマも、ドーナツの表面をなぞるように規則正しく回り続けます。蹴りの強さ
        K を上げると、規則正しい回り方が一つずつ壊れ、でたらめな動き（カオス）に変わります。
      </p>
      <table className="room-table">
        <caption>
          規則正しさが残った最後の K <Tag kind="報告" />
        </caption>
        <thead>
          <tr>
            <th>回転の比</th>
            <th>最後の K</th>
            <th>いまの K（{K.toFixed(3)}）</th>
          </tr>
        </thead>
        <tbody>
          {found.map((f) => (
            <tr key={f.id}>
              <td>
                <Dot color={COLORS[f.id]!} />
                {f.label} = {f.w.toFixed(3)}
              </td>
              <td>{REPORT_LAST[f.id]}</td>
              <td>
                {current ? (f.circle ? `残っている（${f.circle.w.toFixed(6)}）` : '壊れた') : '計算中…'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted small">
        「いまの K」の列は、この画面で報告と同じ方法（始め方 4001 通り × 20000 回の蹴り、回転の比の近く 0.001
        以内に規則正しい回り方があるか）で計算しています <Tag kind="測定" />
        。報告は K を 0.5, 0.55, …, 0.9, 0.95 と、0.95 から先は 0.0025 刻みで調べたので、「1/π は
        0.80」は「0.80 では残り、0.85 では壊れていた」という意味です。
      </p>
      <p>
        K = 0.972 で残っていた規則正しい回り方は 2 つだけで、回転の比は <b>0.618012</b> と <b>0.381988</b>
        、どちらも黄金比です（0.382 = 1 − 0.618）。K = 0.975 ですべて壊れました。これは、物理学者グリーンが
        1979 年に求めた値 0.9716 と一致します <Tag kind="文献" />
        （既知の結果の再現です）。
      </p>
      <Barcode />
      <More label="しくみ（なぜ分数に近いと壊れやすいか）">
        <p>
          コマの回転の比が分数 p/q に近いと、q 回蹴るごとにほぼ同じ向きで蹴られます（1
          章の「同じ所を押される」）。蹴りの効果が積み重なり、その回り方は崩れます。分数から遠い比ほど蹴られる向きがばらけ、長く持ちこたえます。この考え方を
          KAM 理論（コルモゴロフ・アーノルド・モーザー）といいます <Tag kind="文献" />。
        </p>
        <p className="muted small">
          計算式：p′ = p + (K/2π) sin 2πx、x′ = x + p′。規則正しいかどうかは、回転の比を 2
          つの区間で重み付き平均し（Das・Sander・Yorke の方法）、差が 10⁻⁹ 未満なら規則正しいとします。分母
          300 以下の分数に 10⁻⁷ 以内の回り方（島）は数えません。
        </p>
      </More>
    </Section>
  )
}

/** Which rotations are still regular at each K of the report's grid: yellow = regular, one column per K. */
function Barcode() {
  const [cols, setCols] = useState<{ K: number; circles: Circle[] }[]>([])
  const [started, setStarted] = useState(false)
  const canvas = useRef<HTMLCanvasElement>(null)
  const worker = useRhythmWorker((r) => {
    if (r.kind === 'column') setCols((c) => [...c, { K: r.K, circles: r.circles }])
  })
  const start = () => {
    setCols([])
    setStarted(true)
    worker.send({ kind: 'barcode', Ks: K_GRID, n: 4001, N: 20000 })
  }
  useEffect(() => {
    const el = canvas.current
    const ctx = el && fitCanvas(el, 0.75)
    if (!el || !ctx) return
    const W = el.clientWidth || 320
    const H = W * 0.75
    ctx.fillStyle = '#3b0f4f'
    ctx.fillRect(0, 0, W, H)
    const cw = W / K_GRID.length
    cols.forEach((c, i) => {
      ctx.fillStyle = '#f5e44a'
      for (const k of c.circles) ctx.fillRect(i * cw, (1 - k.w) * H - 1, cw + 0.5, 2)
    })
    for (const [w, color] of [
      [GOLDEN, C_PHI],
      [1 - GOLDEN, C_PHI],
      [1 / Math.PI, C_PI],
    ] as const) {
      ctx.strokeStyle = color
      ctx.globalAlpha = 0.7
      ctx.setLineDash([4, 4])
      ctx.beginPath()
      ctx.moveTo(0, (1 - w) * H)
      ctx.lineTo(W, (1 - w) * H)
      ctx.stroke()
    }
    ctx.setLineDash([])
    ctx.globalAlpha = 1
    ctx.fillStyle = '#d9def0'
    ctx.font = '10px sans-serif'
    K_GRID.forEach((k, i) => {
      if (i % 3 === 0 || i === K_GRID.length - 1) ctx.fillText(String(k), i * cw + 1, H - 3)
    })
  }, [cols])
  return (
    <figure className="room-figure">
      <canvas ref={canvas} className="room-canvas" role="img" aria-label="K ごとに残った回り方" />
      <figcaption className="small">
        横は蹴りの強さ K（報告と同じ 22 段階、左 0.5 → 右 0.98）、縦は回転の比（下 0 → 上 1）。<b>黄色</b>
        は、その K でまだ規則正しく回れる回り方です。点線は
        <Dot color={C_PHI} />
        黄金比 0.618 とその対 0.382、
        <Dot color={C_PI} />
        1/π。右へ行くほど黄色が減り、最後まで伸びるのは黄金比の 2 本の高さだけです。{' '}
        {started ? (
          cols.length < K_GRID.length ? (
            `計算中… ${cols.length} / ${K_GRID.length}`
          ) : (
            <>
              <Tag kind="測定" />
              （報告と同じ、始め方 4001 通りで計算）
            </>
          )
        ) : (
          <button onClick={start}>この画面で計算して描く（1〜2 分ほど）</button>
        )}
      </figcaption>
    </figure>
  )
}
