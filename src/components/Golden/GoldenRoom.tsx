import { useEffect } from 'react'
import { closeRoom } from '../../golden/room'
import { useGuideContext } from '../../guide/context'
import { useGuide } from '../../guide/store'
import { Coincidence, Fractions, Kam, Pentagon, Summary, Sunflower, TorusFill } from './Sections'

/**
 * The "φ and π" room: what the golden ratio and π have in common, and where they are opposites,
 * each point shown by something computed on the spot (see src/golden/golden.ts).
 */
const roomContext = () => ({
  page: 'φ と π の部屋',
  about:
    '黄金比 φ と π の関係（正五角形、黄金角、分数への近さ、トーラスを埋める速さ、KAM、偶然の一致）を、その場で計算した図と数値で見せるページ',
})

export function GoldenRoom() {
  useGuideContext('room', roomContext)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Escape in the AI Guide (or while its pen is out) belongs to the guide
      if (e.target instanceof Element && e.target.closest('[data-guide-ignore]')) return
      if (useGuide.getState().drawing) return
      if (e.key === 'Escape') closeRoom()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div
      className="room"
      role="dialog"
      aria-label="φ と π の部屋"
      data-testid="golden-room"
      data-guide-title="φ と π の部屋"
    >
      <header className="room-head">
        <div>
          <h2>
            <span className="accent">φ</span> と <span className="accent">π</span> の部屋
          </h2>
          <p className="muted">
            π（3.14…）は「円そのもの」。黄金比 φ（1.618…）は「円の上で、いちばん繰り返さない回り方」。2
            つは円の上で出会います。
          </p>
        </div>
        <button className="room-close" onClick={closeRoom} aria-label="Close the room">
          ✕
        </button>
      </header>
      <nav className="room-nav" aria-label="Sections">
        <a href="#golden" onClick={jump('pentagon')}>
          1 正五角形
        </a>
        <a href="#golden" onClick={jump('sunflower')}>
          2 黄金角
        </a>
        <a href="#golden" onClick={jump('fractions')}>
          3 分数への近さ
        </a>
        <a href="#golden" onClick={jump('torus')}>
          4 トーラスを埋める
        </a>
        <a href="#golden" onClick={jump('kam')}>
          5 KAM
        </a>
        <a href="#golden" onClick={jump('coincidence')}>
          6 偶然の一致
        </a>
        <a href="#golden" onClick={jump('summary')}>
          まとめ
        </a>
      </nav>
      <main className="room-body">
        <div className="room-intro">
          <p>
            <b>この部屋で分かること：</b>黄金比と π
            は、円の上で出会います。そして「分数にどれだけ似ているか」で正反対の性質を持ち、そのせいで、回したときのふるまいも正反対になります。
          </p>
          <p className="muted">
            読み方：各項目の <b>ひとことで</b> だけ読んでも全体がつかめます。図は動かせます。
            <span className="room-tag room-tag-測定">測定</span> はこのページでその場で計算した値、
            <span className="room-tag room-tag-文献">文献</span> は数学の文献にある値です。
          </p>
        </div>
        <Pentagon />
        <Sunflower />
        <Fractions />
        <TorusFill />
        <Kam />
        <Coincidence />
        <Summary />
        <p className="room-foot muted">
          この部屋の数値と図は、すべてその場で計算しています（sin / cos はどの端末でも同じ結果になる実装、π と
          φ は BigInt で全桁を保証）。「測定」は有限回の計算の結果、「文献」は数学の文献の値です。
        </p>
      </main>
    </div>
  )
}

/** In-page links without touching the URL's hash (it is the room's address). */
const jump = (id: string) => (e: React.MouseEvent) => {
  e.preventDefault()
  document.getElementById(`room-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}
