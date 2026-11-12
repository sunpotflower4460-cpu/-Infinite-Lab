import { useState } from 'react'
import { Dot, More, Section, Tag } from '../Golden/Sections'
import { C_PHI, C_PI, type BeatId } from './common'
import { LiveMedium, MediumControls, type MediumSetup } from './Media'

// ---- 6 the 3D box ------------------------------------------------------------------------------

export function Box3D() {
  const [setup, setSetup] = useState<MediumSetup>({ beat: 'invpi', gamma: 0.05, seed: 1, n: 24 })
  return (
    <Section
      id="box"
      n={6}
      title="実験 C：3D の箱 ― たくさんの場所をつなぐと"
      gist={
        <>
          実験 B の「自分で脈打つ場所」を立方体にぎっしり並べ、となりどうしをつなぎました。γ = 0.05 の拍子で、
          <b style={{ color: C_PI }}>1/π では箱全体の 100% が 1/3 に取り込まれ</b>、
          <b style={{ color: C_PHI }}>黄金比では 0%</b>。箱全体がそろって、自分の速さで動き続けました。
        </>
      }
      look={[
        <>はじめはまだら模様。早送りのあいだに、箱全体の色がそろっていきます（渦は生まれません）</>,
        <>
          測定のあと：1/π では、右上の「拍子」が 3 回光るごとに箱が 1
          回光ります。黄金比では、箱の光る時刻が拍子から少しずつずれていきます
        </>,
      ]}
      figure={<LiveMedium dim={3} setup={setup} label="3D の箱（手前・上・右の 3 面）" />}
    >
      <MediumControls
        setup={setup}
        onChange={setSetup}
        beats={['invpi', 'golden', 'third', 'half']}
        gammas={[0, 0.05]}
        sizes={[
          { n: 24, label: '24³（速い）' },
          { n: 48, label: '48³（報告と同じ・数分かかります）' },
        ]}
      />
      <p>
        <b>やったこと：</b>自分で振動する場所を 48×48×48
        の立方体に並べ、となりどうしをつなぎました（となりとの差をならす力、拡散 D =
        1）。はじめの状態はまだら模様のランダムで、箱全体に同じ拍子（γ = 0.05）をかけました。
      </p>
      <table className="room-table room-kv">
        <caption>
          結果 <Tag kind="報告" />
        </caption>
        <tbody>
          <tr>
            <td>
              <Dot color={C_PI} />
              1/π の拍子
            </td>
            <td>箱全体の 100% が 1/3（3 拍に 1 回）に取り込まれた（試行 2 回とも）</td>
          </tr>
          <tr>
            <td>
              <Dot color={C_PHI} />
              黄金比の拍子
            </td>
            <td>
              取り込まれたのは 0%。箱全体がそろって、自分の速さ（拍子 1 回に 0.613 回）で動き続けた（試行 2
              回とも）
            </td>
          </tr>
          <tr>
            <td>1/3・1/2・1/1 の拍子</td>
            <td>100% 取り込まれた</td>
          </tr>
          <tr>
            <td>渦</td>
            <td>この始め方では、渦（らせん状の波）は生まれなかった。箱全体が一様に揺れていた</td>
          </tr>
        </tbody>
      </table>
      <p className="muted small">
        上の図はこの画面での計算です <Tag kind="測定" />
        。法則・係数・判定は報告と同じで、まだら模様の乱数だけがこの画面のものです。24³ は報告の 48³
        より小さい箱ですが、渦のない箱は全体が一つにそろうので、大きさで結果は変わりません（48³
        を選ぶと報告と同じ大きさで確かめられます）。
      </p>
    </Section>
  )
}

// ---- 7 the 2D plane ------------------------------------------------------------------------------

export const PLANE_SEEDS = [
  { seed: 6, label: 'A' },
  { seed: 9, label: 'B' },
  { seed: 1, label: 'C' },
]

export function Plane2D() {
  const [setup, setSetup] = useState<MediumSetup>({ beat: 'invpi', gamma: 0.05, seed: 6, n: 128 })
  return (
    <Section
      id="plane"
      n={7}
      title="実験 D：2D の平面 ― 自分で生まれた渦は、外に流されない"
      gist={
        <>
          同じ法則を平面（128×128）で行うと、<b>らせん状の波が自然に生まれ</b>
          、平面全体のリズムを決めるペースメーカーになりました。らせんがあると、γ = 0.05
          の拍子にはほとんど取り込まれません。3D で 100% 取り込まれた <b style={{ color: C_PI }}>1/π</b>{' '}
          でも、平面では 0% でした。
        </>
      }
      look={[
        <>黄色が興奮しているところです。まだら模様から、らせんが生まれて回り出すところ</>,
        <>
          1/π・γ = 0.05 の拍子が鳴っても、らせんのリズムが勝つところ（取り込まれた割合 0%）。γ = 0.3
          にすると、らせんが消えて全体が拍子にそろいます
        </>,
      ]}
      figure={<LiveMedium dim={2} setup={setup} label="2D の平面" />}
    >
      <MediumControls
        setup={setup}
        onChange={setSetup}
        beats={['invpi', 'golden', 'third', 'half']}
        gammas={[0, 0.05, 0.15, 0.3]}
        seeds={PLANE_SEEDS}
      />
      <p>
        <b>やったこと：</b>3D の箱と同じ法則・同じ始め方を、平面（128×128）で行いました。
      </p>
      <table className="room-table room-kv">
        <caption>
          結果 <Tag kind="報告" />
        </caption>
        <tbody>
          <tr>
            <td>らせん</td>
            <td>
              自然に生まれた（中心は 6〜12 個）。一様な揺れより約 1.21 倍速く回り（拍子 1 回に 0.75
              回）、平面全体のリズムを決めた
            </td>
          </tr>
          <tr>
            <td>γ = 0.05</td>
            <td>どの比でも 0〜4% しか取り込まれない。3D で 100% だった 1/3 や 1/π でも 0%</td>
          </tr>
          <tr>
            <td>γ = 0.15</td>
            <td>らせんが減る（1/π で 2 個に、黄金比では消えた）</td>
          </tr>
          <tr>
            <td>γ = 0.3</td>
            <td>らせんが消えて、全体が取り込まれた（1/π は 1/3 に、黄金比は 3/4 に）</td>
          </tr>
        </tbody>
      </table>
      <p>
        <Tag kind="読み方" />{' '}
        自分で作った渦のリズムを持つ場は、外の拍子に流されにくい。渦のない一様な場は、簡単な比の拍子にすぐ取り込まれる。
      </p>
      <More label="この画面で確かめたこと（報告と違うところも）">
        <p>
          この画面の計算機で、報告と同じ手順を始め方 A・B（どちらもらせんが生まれる）で測りました{' '}
          <Tag kind="測定" />。
        </p>
        <ul>
          <li>
            らせんの中心 8〜16 個。平面のリズムは拍子 1 回に約 0.75 回で、3D の箱（0.62）の約 1.21
            倍。報告と同じです。
          </li>
          <li>γ = 0.05：1/π と 1/3 は 0%。報告と同じです。</li>
          <li>
            γ = 0.05 の黄金比では、9〜13% が 3/4 に取り込まれました（報告は 0〜4%）。らせんのリズム（約
            0.75）が分数 3/4 にとても近いので、平面の一部がそこにそろったためです。
          </li>
          <li>γ = 0.3：らせんが消え、1/π は 1/3 に、黄金比は 3/4 に、どちらも 100%。報告と同じです。</li>
          <li>
            γ = 0.15：始め方 A では、1/π でもらせんが消えて 1/3 に 100% 取り込まれました（報告の 1
            回の試行では、らせんが 2 個残り 0%）。γ = 0.15
            は、らせんが残るかどうかの境目に近く、始め方で結果が変わります。
          </li>
        </ul>
        <p>
          らせんが生まれるかどうかも、はじめのまだら模様しだいです。この画面の乱数で 10
          通りの始め方を試すと、8 通りでらせんが生まれ（中心 2〜14 個）、2 通りでは生まれませんでした。始め方
          C はその 1 つで、らせんのない平面は 3D の箱と同じように一様に揺れ、1/3 の拍子に 100%
          取り込まれます。「渦があるかないか」が取り込まれるかどうかを分けていることが、ここでも確かめられます。
        </p>
      </More>
    </Section>
  )
}

// ---- 8 the heart -------------------------------------------------------------------------------

export function Heart() {
  const [live, setLive] = useState<{ beat: BeatId; gamma: number } | null>(null)
  const [setup] = useState<MediumSetup>({ beat: 'golden', gamma: 0, seed: 6, n: 128 })
  return (
    <Section
      id="heart"
      n={8}
      title="実際の心臓との対応"
      gist={
        <>
          今回の媒質は心臓の模型ではありません。ただ、<b>心臓と同じ種類の法則</b>
          を持っていて、心臓で知られている現象と同じ形のことが起きました。
        </>
      }
      look={[
        <>左の平面は、拍子なしで始めて、らせん（旋回する興奮の波）ができた状態です</>,
        <>
          「強い拍子をかける」を押すと、らせんの中心の数が減り、消えて、全体が拍子にそろうところ（除細動と同じ考え方）
        </>,
      ]}
      figure={
        <div>
          <LiveMedium dim={2} setup={setup} label="らせんと強い拍子" liveBeat={live} />
          <div className="room-buttons">
            <button onClick={() => setLive({ beat: 'golden', gamma: 0.3 })}>
              強い拍子（γ = 0.3）をかける
            </button>
            <button onClick={() => setLive({ beat: 'golden', gamma: 0.05 })}>
              弱い拍子（γ = 0.05）にする
            </button>
            <button onClick={() => setLive({ beat: 'golden', gamma: 0 })}>拍子を止める</button>
          </div>
          <p className="muted small">
            <Tag kind="測定" /> この平面の計算は 7
            章と同じです（拍子の比は黄金比）。途中で拍子を変えると、そこからあらためて 40 周期落ち着かせて 45
            拍を記録し、取り込まれた割合を出します。
          </p>
        </div>
      }
    >
      <HeartPicture />
      <table className="room-table room-long">
        <caption>
          対応 <Tag kind="読み方" />
        </caption>
        <thead>
          <tr>
            <th>今回の実験</th>
            <th>実際の心臓</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>自分で規則正しく振動する場所</td>
            <td>
              <b>洞結節</b>：心臓の天然のペースメーカー。自分で規則正しく電気を出す細胞の集まり
            </td>
          </tr>
          <tr>
            <td>外の拍子に p:q で取り込まれる。アーノルドの舌</td>
            <td>
              人工ペースメーカーで心臓を動かすときの「捕捉」。周期的に刺激したヒヨコ胚の心臓細胞で、舌や階段が実際に測られた（Guevara・Glass・Shrier、1981
              年）
              <Tag kind="文献" />
            </td>
          </tr>
          <tr>
            <td>3 拍に 1 回、2 拍に 1 回のような比</td>
            <td>
              不整脈の<b>ウェンケバッハ型</b>（3:2、4:3）や <b>2:1 ブロック</b>。心臓の中の 2
              つのリズムが、分数の比でロックした状態
            </td>
          </tr>
          <tr>
            <td>2D で自然に生まれたらせんが、速いリズムで全体を支配した</td>
            <td>
              <b>リエントリー</b>
              （興奮の波が旋回し続けること）による頻拍。らせんは洞結節より速く回るので、心臓は一番速いリズムに従ってしまう。らせんが崩れると細動になる
            </td>
          </tr>
          <tr>
            <td>弱い拍子ではらせんを止められず、強い拍子（γ = 0.3）でらせんが消えて全体がそろった</td>
            <td>
              らせんより速く刺激して止める<b>オーバードライブ・ペーシング</b>
              や、強い電気ショックで全体をそろえ直す<b>除細動</b>と同じ考え方
            </td>
          </tr>
        </tbody>
      </table>
      <div className="room-caution">
        <b>本物の心臓と違うところ</b>
        <ul>
          <li>
            本物で自分で振動するのは、洞結節だけです。残りの心筋は「刺激されれば興奮するが、自分では振動しない」組織です。今回は、全部の場所が自分で振動するようにしました。
          </li>
          <li>拍子は箱全体に一様にかけました。本物のペースメーカーは、電極の 1 点から刺激します。</li>
          <li>心筋の繊維の向き、壁の厚み、細胞どうしのつながり方は入れていません。</li>
          <li>
            心臓で黄金比が特別な役割を持つという確かな証拠は、ありません。今回の結論は「分数から遠い比ほど取り込まれにくい」という一般的なことです。
          </li>
        </ul>
      </div>
    </Section>
  )
}

const HEART =
  'M100 170 C 40 125, 8 92, 20 52 C 30 20, 72 12, 100 44 C 128 12, 170 20, 180 52 C 192 92, 160 125, 100 170 Z'

/** A schematic heart: the sinus node sends a beat that spreads (a picture, not a model). */
function HeartPicture() {
  return (
    <figure className="room-figure room-heart">
      <svg viewBox="0 0 200 180" role="img" aria-label="心臓の模式図">
        <defs>
          <clipPath id="room-heart-clip">
            <path d={HEART} />
          </clipPath>
        </defs>
        <path d={HEART} fill="#2a1420" stroke="#e8a0c8" strokeWidth="2" />
        <g clipPath="url(#room-heart-clip)">
          <circle
            className="room-heart-wave"
            cx="62"
            cy="50"
            r="6"
            fill="none"
            stroke="#ffc766"
            strokeWidth="2"
            vectorEffect="non-scaling-stroke"
          />
        </g>
        <circle cx="62" cy="50" r="5" fill="#ffc766" className="room-heart-node" />
        <text x="72" y="40" fontSize="10" fill="#ffc766">
          洞結節
        </text>
      </svg>
      <figcaption className="small muted">
        模式図 <Tag kind="読み方" />
        ：右心房にある洞結節が、自分のリズムで興奮を送り出し、それが心臓全体に広がります。
      </figcaption>
    </figure>
  )
}
