import { useEffect } from 'react'
import { closeRoom } from '../../golden/room'
import { Coincidence, Fractions, Kam, Pentagon, Sunflower, TorusFill } from './Sections'

/**
 * The "φ and π" room: what the golden ratio and π have in common, and where they are opposites,
 * each point shown by something computed on the spot (see src/golden/golden.ts).
 */
export function GoldenRoom() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeRoom()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="room" role="dialog" aria-label="φ と π の部屋" data-testid="golden-room">
      <header className="room-head">
        <div>
          <h2>
            <span className="accent">φ</span> と <span className="accent">π</span> の部屋
          </h2>
          <p className="muted">
            π は「円そのもの」、黄金比 φ = 1.618… は「円の上で、いちばん繰り返さない回り方」。2
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
      </nav>
      <main className="room-body">
        <Pentagon />
        <Sunflower />
        <Fractions />
        <TorusFill />
        <Kam />
        <Coincidence />
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
