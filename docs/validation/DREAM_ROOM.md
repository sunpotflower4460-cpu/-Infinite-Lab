# 言葉と意味の部屋 — 設計・根拠・動作確認

Infinite Lab に独立した部屋 `#dream` を追加した。既存の π、球面、鏡像、陰陽、トーラス、第3の円と、φ の部屋を維持する。Dream-box のソースは変更していない。

参照したのは [Dream-box main `8874604831ae596ecba4c9cc7dc5a25228e5db65`](https://github.com/sunpotflower4460-cpu/Dream-box/tree/8874604831ae596ecba4c9cc7dc5a25228e5db65)（2026-11-14 確認）。後日の main を自動取得して図の意味が変わることはない。

## 1. 言葉から意味が広がり、一つを選ぶモデル

Atlas の [prior.json](https://github.com/sunpotflower4460-cpu/Dream-box/blob/8874604831ae596ecba4c9cc7dc5a25228e5db65/experiments/concept-research/atlas/prior.json) の **21概念・23関係**をそのまま使用する。登録された表記から概念を引き、種類・用途・部位・素材・変化などを別の辺で結ぶ。表示は outgoing の2段先まで。同じ概念は重複表示しない。

「じゃがいも」の既定例では、塊茎（種類）、食材（用途）、じゃがいもの植物（一部）、茹でる（できること）へ広がり、さらに植物・調理へ続く。「料理に適する個体」という明示的な仮定と「料理」という文脈を与え、「用途」の観点で食材が選ばれる。

**選ぶ規則はこの部屋の説明用に追加したもの**である。指定した関係型の、直接つながった肯定の MATCH が一意で、否定の阻害がない場合だけ選ぶ。Atlas の既存 API が常に一つの勝者を自動決定する、という説明ではない。

- 原コードの表記照合は NFKC＋trim。多義語「はし」は文脈を指定するまで選ばない。
- 条件が未知なら PENDING。条件が不成立、文脈が不一致なら選べない。
- 「じゃがいも模型 → 食材」の否定は肯定に読み替えない。
- 未登録語から架空の関係を生成しない。入力欄は汎用の意味理解・画像生成・LLMではない。
- 距離・角度は見やすい配置。意味の類似度、脳内活動、エネルギー、推論の確率の測定値ではない。
- スマホでは2段目を下へ配置し、文字が画面端へ隠れないようにする。

[Atlas 照会 API](https://github.com/sunpotflower4460-cpu/Dream-box/blob/8874604831ae596ecba4c9cc7dc5a25228e5db65/experiments/concept-research/atlas/graph-api.mjs) と、648通りの語・文脈・条件、525本の直接関係を照合し一致した。[照合結果](dream-room/atlas-review.json)。この照合は固定 prior の範囲に限る。説明用の選択規則自体を Atlas の機能として数えていない。

## 2. 現在の Dream-box で起きる処理

実装の入口は [main.js](https://github.com/sunpotflower4460-cpu/Dream-box/blob/8874604831ae596ecba4c9cc7dc5a25228e5db65/experiments/text-to-living-world/src/main.js)、理解・候補・プレビュー・反映は [meaning/index.js](https://github.com/sunpotflower4460-cpu/Dream-box/blob/8874604831ae596ecba4c9cc7dc5a25228e5db65/experiments/text-to-living-world/src/meaning/index.js) で確認した。

1. 原文と正規化テキスト、世界の版、話者・視点・直前の会話を保持する。
2. 対応文法、物理文法、明示的な定義、会話の参照などを調べる。汎用の分かち書きだけで全処理が決まる構成ではない。
3. 解釈候補と、その意味 Graph、対象の実IDを作る。
4. 曖昧さ・不足・実行可能性を確認する。理解とプレビューだけでは元の世界を変えない。
5. 選択済みで実行可能なら計画を反映する。世界が変わっていれば再確認し、未知語や能力不足は保持する。会話・保留の再開も記録する。

部屋では実エンジンを **物理世界・seed 1**で実行し採取した、5ケース・12通りの記録を再生する。

| ケース                               | 実コードで確認した結果                                                      |
| ------------------------------------ | --------------------------------------------------------------------------- |
| 箱を三つ作る                         | box7・box8・box9 を作る。指定の数を保つ                                     |
| 箱を赤くする（事前に箱3個）          | 3個の各対象＋全3個体の4候補。未選択なら物体は不変。選択した対象だけ赤くなる |
| それを青くする（直前に箱3個）        | 「それ」は box7・8・9 の3候補。box8 を選べば box8 だけ青くなる              |
| 「星のたね」を一つ作る               | 説明を待ち、元の入力を保持。形を勝手に推測しない                            |
| 「星のたね」とは、小さな木の球とする | 定義が成立し、保留した元の作成を再開。直径0.5mの球が1個できる               |

画面の候補を選ぶと、その選択で実行した記録へ切り替わる。ここで新たに Dream-box のエンジンを実行したり、ユーザーの Dream-box 世界を書き換えたりはしない。世界の図は記録した座標・寸法・色の簡略な等角投影で、物理計算の別実装ではない。表示時間を説明用に伸ばしており、処理時間のベンチマークではない。

概念研究の Atlas A と経験接地 B は別系統であり、本文アプリが両者の全研究結果から自動で世界を作っているという図にはしていない。初期の「未マージ」という研究資料の記述を現在の main の状態と取り違えない。

採取データは `src/dream/data/executions.json`。参照ソースの SHA-256、元の入力、解釈候補、計画、プレビュー、反映結果、保留語を含む投影で、全 WorldState や全物理メモリのダンプではない。採取時に以下を検査し、再採取の `--check` でも一致した。

- `understand` の前後で世界・session が不変。
- `previewUnderstanding` の前後で世界・session が不変。
- 未選択・未知語では物体が不変。
- 個数、各候補の対象ID、色の変更、説明後の球の寸法が実結果と一致。

## 動画と実画面

| 動画                                                                 | 内容                                                                     | 形式               |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------ | ------------------ |
| [意味が放射状に広がる](dream-room/meaning-radial.mp4)                | じゃがいも → 関係の展開 → 用途で食材を選択                               | 16秒・480フレーム  |
| [現在の Dream-box の仕組み](dream-room/dream-box-implementation.mp4) | 作成 → 未選択で待機 → box8 を選択 → 未知語の保留 → 定義して再開（各8秒） | 40秒・1200フレーム |

どちらも **1440×900、30fps、H.264 / MP4**。1本目は画面の「動画を保存」から、2本目は同じ描画・符号化処理で5ケースを連続した説明動画として書き出した。元のアニメーション位置や π のステップを動かさずに書き出す。動画には音声を含まない。

全フレームの FFmpeg デコード、ffprobe の形式・フレーム数、ブラウザの動画読み込み・シークを確認。実際の動画からフレームを抽出して図と文字も確認した。[動画検査](dream-room/video-verification.json) / [画面・保存の記録](dream-room/capture.json)。

[デスクトップの意味図](dream-room/meaning-desktop.png) / [未選択](dream-room/implementation-waiting.png) / [box8選択後](dream-room/implementation-selected.png) / [スマホの意味図](dream-room/meaning-mobile.png) / [スマホの実装図](dream-room/implementation-mobile.png)。

## テストと操作

- 型検査・ESLint・production build：成功。既存の大きな描画用チャンクについての Vite 警告は継続。新しい部屋は遅延読み込みで分離した。
- 単体：**453/453**。新規8件は、元の登録関係、条件待ち、多義語、未知語、否定、対象ID、個数、保留と再開を確認する。
- Chromium E2E：通常 **55/55**、WebGL無効 **55/55**、計 **110/110**。π・φ・トーラス・第3の円・JSON・動画の既存回帰を含む。
- 新規4件のブラウザ検査：直リンク・履歴・Film/φとの切替、背後のπショートカット停止、条件・多義語・未知語、実候補と対象の変更、PNG/JSON/MP4、390×844、保存前後の時間位置とπステップ保持。
- 動画機能がないブラウザでは理由を表示し、PNG・JSONを利用可能にする。MP4のコーデックが使えない場合はWebMを選べる。保存の中止にも対応。
- 開いた部屋にフォーカスを保ち、Escで閉じる。タブは矢印/Home/Endにも対応。`prefers-reduced-motion` では初回の自動再生を停止する。
- スマホ検査はブラウザの390×844とタッチ環境のシミュレーション。実機iPhone・実GPUの性能検査ではない。

## 再現

```sh
npm run dev -- --port 4180 --strictPort
# 別のターミナル
node tools/validation/dream-atlas-review.mjs /path/to/Dream-box
node tools/validation/dream-source.mjs /path/to/Dream-box --check
node tools/validation/dream-room.mjs
npm run typecheck
npm run lint
npm test
PLAYWRIGHT_CHROMIUM_PATH=/usr/bin/chromium PW_NO_WEBGL=1 npm run test:e2e
```

Dream-box は上記固定SHAを用い、参照するソースに未コミット変更がないことを検査する。採取には参照アプリの Three と、同梱の Rapier を使える状態が必要。Atlas照合は固定priorのスカラー条件のみを対象にし、未知の将来の条件形式を黙って受理しない。

mainへ自動マージしない。部屋の差分は、既存の球面・第3の円の作業を親とした独立ブランチ `feature/dream-meaning-room` に置いた。
