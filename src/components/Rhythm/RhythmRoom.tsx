import { useEffect } from 'react'
import { closeRoom } from '../../golden/room'
import { useGuideContext } from '../../guide/context'
import { useGuide } from '../../guide/store'
import { Tag } from '../Golden/Sections'
import { NearAndFar, TwoRotations } from './Basics'
import { OneCell, Tongues } from './Beat'
import { Glossary, Meaning, Numbers } from './Closing'
import { Box3D, Heart, Plane2D } from './Experiments'
import { KickedTop } from './KickedTop'
import { C_PHI, C_PI } from './common'

/**
 * The rhythm textbook (#rhythm): "the golden rotation is hard to break, the π rotation is easy to
 * capture", one step at a time, every experiment running live with the report's own laws.
 */
const roomContext = () => ({
  page: 'リズムの教科書',
  about:
    '黄金比の回転は壊れにくく、π の回転は取り込まれやすいことを、標準写像（蹴られるコマ）、フィッツヒュー–南雲の 1 か所・3D の箱・2D の平面への外の拍子、アーノルドの舌で見せる動く教科書。数値は研究の報告（Aeterna-Genesis P16）と、その場の計算。心臓との対応は解釈。',
})

const NAV = [
  ['two', '1 2 つの回転'],
  ['near', '2 分数への近さ'],
  ['top', '3 蹴られるコマ'],
  ['cell', '4 1 か所に拍子'],
  ['tongues', '5 アーノルドの舌'],
  ['box', '6 3D の箱'],
  ['plane', '7 2D の平面'],
  ['heart', '8 心臓'],
  ['meaning', '9 意味'],
  ['terms', '10 用語'],
  ['numbers', '11 数字'],
] as const

export function RhythmRoom() {
  useGuideContext('room', roomContext)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
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
      aria-label="リズムの教科書"
      data-testid="rhythm-room"
      data-guide-title="リズムの教科書"
    >
      <header className="room-head">
        <div>
          <h2>
            <span style={{ color: C_PHI }}>黄金比</span>の回転は壊れにくく、
            <span style={{ color: C_PI }}>π</span>
            の回転は取り込まれやすい
          </h2>
          <p className="muted">
            分数に近い比で回るものは、外からの揺さぶりや拍子に「捕まる」。分数から一番遠い黄金比の回転は、最後まで自分を保つ。動く教科書です。
          </p>
        </div>
        <button className="room-close" onClick={closeRoom} aria-label="Close the room">
          ✕
        </button>
      </header>
      <nav className="room-nav" aria-label="Sections">
        {NAV.map(([id, label]) => (
          <a key={id} href="#rhythm" onClick={jump(id)}>
            {label}
          </a>
        ))}
      </nav>
      <main className="room-body">
        <div className="room-intro">
          <p>
            <b>この教科書で分かること：</b>2
            つの速さの比が分数に近いと、外に「捕まり」やすい。分数から一番遠い黄金比は、最後まで自分を保つ。これを
            3 つの実験で測った研究を、1
            つずつ動かしながら見ていきます。最後に、心臓で起きていることとの対応も書きます。
          </p>
          <p>
            <b>もとの研究：</b>Aeterna-Genesis
            は、「法則（場所ごとの小さな反応のルール）だけを置き、答えは置かずに、何が自然に育つか」を計算で確かめる研究です。合言葉は「
            <b>それは育ったのか、置いたのか？</b>」。今回の問いは、うえきさんの質問「黄金比と
            3.14（π）には、何か近いところがあるか」から始まりました。
          </p>
          <p className="muted">
            読み方：各章の <b>ひとことで</b>{' '}
            だけ読んでも全体がつかめます。図はすべて、この画面で同じ式を動かしています。
            <span className="room-tag room-tag-測定">測定</span> はこの画面でいま計算した値、
            <span className="room-tag room-tag-報告">報告</span> は研究の報告書で測った値、
            <span className="room-tag room-tag-文献">文献</span> は既知の文献の値、
            <span className="room-tag room-tag-読み方">読み方</span> は測定ではなく、解釈やたとえ話です。
          </p>
        </div>
        <TwoRotations />
        <NearAndFar />
        <KickedTop />
        <OneCell />
        <Tongues />
        <Box3D />
        <Plane2D />
        <Heart />
        <Meaning />
        <Glossary />
        <Numbers />
        <p className="room-foot muted">
          重い計算（3〜7 章）は、その章が画面に出ているあいだだけ動きます。端末によっては 1
          回の測定に数十秒かかります。
          <Tag kind="測定" /> の値は、有限回の計算の結果です。
        </p>
      </main>
    </div>
  )
}

const jump = (id: string) => (e: React.MouseEvent) => {
  e.preventDefault()
  document.getElementById(`room-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}
